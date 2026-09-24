import {
  decodeEventLog,
  decodeFunctionData,
  TransactionReceiptNotFoundError,
  type Hex,
} from "viem";
import {
  abi,
  domains,
  otherChain,
  same,
  ownerlessId,
  SERVICE,
  TRANSMITTER,
  type BridgeChain,
} from "./contracts";
import { bridgeClient, BridgeReads } from "./read";
export function events(
  logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[],
  address: string,
  name: string,
) {
  return logs
    .filter((l) => same(l.address, address))
    .flatMap((l) => {
      try {
        const e = decodeEventLog({
          abi,
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
        });
        return e.eventName === name ? [e] : [];
      } catch {
        return [];
      }
    });
}
export async function status(chain: BridgeChain, hash: Hex) {
  const client = bridgeClient(chain);
  if ((await client.getChainId()) !== chain)
    throw Error("Source RPC returned the wrong chain.");
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (e) {
    if (e instanceof TransactionReceiptNotFoundError)
      return {
        state: "pending",
        message: "Waiting for a source receipt. Do not submit again.",
      };
    throw e;
  }
  const tx = await client.getTransaction({ hash });
  const binding = {
    from: tx.from,
    to: tx.to,
    data: tx.input,
    value: String(tx.value),
    nonce: tx.nonce,
    finalized: false,
  };
  if (
    (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
    receipt.blockHash
  )
    return {
      state: "pending",
      binding,
      message: "Source chain reorganized. Waiting for a canonical receipt.",
    };
  if (
    (await client.getBlock({ blockTag: "finalized" })).number! <
    receipt.blockNumber
  )
    return {
      state: "pending",
      binding,
      message: "Source confirmed; waiting for finality.",
    };
  binding.finalized = true;
  if (receipt.status === "reverted")
    return {
      state: "failed",
      binding,
      message: "Source transaction reverted and finalized.",
    };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi, data: tx.input });
  } catch {
    return {
      state: "failed",
      binding,
      message:
        "Finalized non-bridge transaction. May reconcile a replaced wallet request.",
    };
  }
  if (decoded.functionName === "approve") {
    const [spender, amount] = decoded.args;
    const approved =
      tx.to &&
      events(receipt.logs, tx.to, "Approval").some((e) => {
        const a = e.args as { owner: string; spender: string; value: bigint };
        return (
          same(a.owner, tx.from) &&
          same(a.spender, spender) &&
          a.value === amount
        );
      });
    if (!approved)
      throw Error(
        "Approval receipt did not confirm the requested allowance. Do not retry before reconciliation.",
      );
    return {
      state: "complete",
      binding,
      message: "Approval finalized. Review the next step.",
    };
  }
  if (
    !tx.to ||
    !same(tx.to, SERVICE) ||
    ![
      "registerOwnerlessToken",
      "deployRemoteOwnerlessToken",
      "crossChainTransfer",
    ].includes(decoded.functionName)
  )
    return {
      state: "failed",
      binding,
      message:
        "Finalized non-bridge transaction. May reconcile a replaced wallet request.",
    };
  if (decoded.functionName === "registerOwnerlessToken") {
    const token = decoded.args[0],
      id = ownerlessId(chain, token);
    const registered = events(
      receipt.logs,
      SERVICE,
      "CrossChainTokenIdClaimed",
    ).some((e) => {
      const a = e.args as { tokenId: Hex; tokenAddress: string };
      return a.tokenId === id && same(a.tokenAddress, token);
    });
    if (!registered) throw Error("Registration event could not be verified.");
    return {
      state: "complete",
      binding,
      message: "Registration finalized. Look up the token to continue setup.",
    };
  }
  const sent = events(receipt.logs, TRANSMITTER, "MessageSent");
  if (sent.length !== 1)
    throw Error("Cannot bind this transaction to one Circle message.");
  const raw = (sent[0].args as { message: Hex }).message;
  if (
    decoded.functionName === "deployRemoteOwnerlessToken" &&
    decoded.args[1] === domains[otherChain(chain)]
  ) {
    // A competing deployment may consume a different message. Prove shared
    // setup at finalized blocks, without claiming this request was delivered.
    const reads = new BridgeReads(true);
    const route = await reads.route(chain, decoded.args[0]);
    await reads.canonical();
    if (
      route?.state === "ready" &&
      route.origin === chain &&
      route.tokenId === ownerlessId(chain, decoded.args[0])
    )
      return {
        state: "complete",
        binding,
        message:
          "Shared ownerless wrapper verified at finalized blocks. This deployment request may have been superseded; its forwarding fee is not assumed refunded.",
      };
  }
  const response = await fetch(
    `https://iris-api.circle.com/v2/messages/${domains[chain]}?transactionHash=${hash}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (!response.ok)
    return {
      state: "forwarding",
      binding,
      message: "Source finalized. Circle status is unavailable; do not resend.",
    };
  const payload = await response.json();
  // Attestation nonce/finality fields are populated by Circle. Bind the immutable
  // source/destination/sender/recipient and complete message body to the receipt.
  const records = Array.isArray(payload.messages) ? payload.messages : [];
  const matches = records.filter(
    (m: { message?: string }) =>
      typeof m.message === "string" &&
      /^0x[0-9a-fA-F]+$/.test(m.message) &&
      m.message.length === raw.length &&
      same(m.message.slice(0, 26), raw.slice(0, 26)) &&
      same(m.message.slice(90, 290), raw.slice(90, 290)) &&
      same(m.message.slice(298), raw.slice(298)),
  );
  if (
    matches.length !== 1 ||
    !/^0x[0-9a-fA-F]{64}$/.test(matches[0].forwardTxHash ?? "")
  )
    return {
      state: "forwarding",
      binding,
      message:
        "Source finalized. Waiting for Circle attestation and paid forwarding. Do not resend.",
    };
  const message = matches[0].message as Hex,
    destHash = matches[0].forwardTxHash as Hex,
    destination = otherChain(chain),
    dc = bridgeClient(destination);
  if ((await dc.getChainId()) !== destination)
    throw Error("Destination RPC returned the wrong chain.");
  let dr;
  try {
    dr = await dc.getTransactionReceipt({ hash: destHash });
  } catch (e) {
    if (e instanceof TransactionReceiptNotFoundError)
      return {
        state: "forwarding",
        binding,
        message: "Destination transaction pending.",
      };
    throw e;
  }
  const received = events(dr.logs, TRANSMITTER, "MessageReceived").some((e) => {
    const a = e.args as {
      nonce: Hex;
      sourceDomain: number;
      sender: Hex;
      messageBody: Hex;
    };
    return (
      a.sourceDomain === domains[chain] &&
      same(a.nonce, "0x" + message.slice(26, 90)) &&
      same(a.sender, "0x" + message.slice(90, 154)) &&
      same(a.messageBody, "0x" + message.slice(298))
    );
  });
  if (dr.status !== "success" || !received)
    return {
      state: "forwarding",
      binding,
      message:
        "Forwarding needs reconciliation. Source funds must not be sent again.",
    };
  const eventName =
    decoded.functionName === "crossChainTransfer"
      ? "TransferDelivered"
      : "CrossChainTokenDeployed";
  if (events(dr.logs, SERVICE, eventName).length !== 1)
    throw Error("Destination delivery event could not be verified.");
  const delivered = events(dr.logs, SERVICE, eventName)[0].args as {
    tokenId: Hex;
    transferRecipient?: string;
    amount?: bigint;
    sourceDomain?: number;
  };
  if (decoded.functionName === "crossChainTransfer") {
    const [id, amount, dest, recipient] = decoded.args;
    if (
      dest !== domains[destination] ||
      delivered.tokenId !== id ||
      delivered.amount !== amount ||
      delivered.sourceDomain !== domains[chain] ||
      !same(delivered.transferRecipient || "", recipient)
    )
      throw Error("Delivery does not match the source transfer.");
  } else if (
    decoded.functionName === "deployRemoteOwnerlessToken" &&
    (decoded.args[1] !== domains[destination] ||
      delivered.tokenId !== ownerlessId(chain, decoded.args[0]))
  )
    throw Error("Deployment does not match the source request.");
  const finalized = await dc.getBlock({ blockTag: "finalized" });
  if (
    finalized.number! < dr.blockNumber ||
    (await dc.getBlock({ blockNumber: dr.blockNumber })).hash !== dr.blockHash
  )
    return {
      state: "forwarding",
      binding,
      message: "Destination execution confirmed; waiting for finality.",
    };
  return {
    state: "complete",
    binding,
    destination,
    destinationHash: destHash,
    message: "Circle delivery verified on the destination chain.",
  };
}
