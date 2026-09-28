import {createPublicClient, toHex, type Address} from "viem";
import {arcConfigFromEnv, arcChain} from "../arc/config";
import {arcTransport} from "../arc/transport";
import {createArcRpc, checkArcRpc} from "../arc/rpc";
import {repository} from "../otc/repository";
import {readFeeReport} from "./read";
import {applyFeeHistory, bindingFor, feeTopics, historyId, sameBinding, sumFeeLogs, type FeeHistory, type FeeLog} from "./history";

/** Read-only chain indexing; the only writes are private index checkpoints in Convex. */
export async function readServiceFeeReport(input: unknown) {
  const report = await readFeeReport(input), binding = bindingFor(report);
  if (!binding) return report;
  try {
    const repo = repository(), old = await repo.read<FeeHistory | null>({id: historyId(binding.token)});
    if (old && sameBinding(binding, old.binding) && BigInt(old.nextBlock) > 0n && BigInt(old.nextBlock) <= BigInt(report.evidence!.blockNumber) + 1n) {
      const rpc = createArcRpc(arcConfigFromEnv());
      const block = await rpc.block(BigInt(old.nextBlock) - 1n);
      applyFeeHistory(report, old, block.hash);
    }
    await repo.command("fee_history_request", {binding, targetBlock: report.evidence!.blockNumber});
    if (!report.lifetimeFeesEarned) report.warnings.push("Lifetime fee history is being indexed. Retry this report after the backfill completes; unknown is not zero.");
  } catch {report.warnings.push("Lifetime fee index is temporarily unavailable; current verified balances are still shown.");}
  return report;
}

export async function runFeeHistory(id: string) {
  const repo = repository();
  let history = await repo.read<FeeHistory | null>({id});
  if (!history || history.kind !== "fee_history") throw Error("Fee history missing");
  const report = await readFeeReport({token: history.binding.token}), binding = bindingFor(report);
  if (!binding || !sameBinding(binding, history.binding)) throw Error("Fee history contract binding changed");
  const config = arcConfigFromEnv(), rpc = createArcRpc(config);
  await checkArcRpc(rpc, config);
  // Range caps differ by provider. A valid read rejected with HTTP 400 by one
  // endpoint must still be tried on the other chain-validated read endpoints.
  const urls = [...new Set([...(config.quoteRpcUrls ?? []), config.rpcUrl, ...config.rpcFallbackUrls, ...config.readOnlyRpcUrls])];
  const clients = urls.map(url => {
    const isolated = {...config, rpcUrl: url, quoteRpcUrls: [url], rpcFallbackUrls: [], readOnlyRpcUrls: []};
    return createPublicClient({chain: arcChain(isolated), transport: arcTransport(isolated)});
  });
  let preferred = 0;
  const sources = binding.family === "portal8-escrow" ? [{address: binding.hook, topic: feeTopics.quote}] : [{address: binding.hook, topic: feeTopics.tax}, {address: binding.locker, topic: feeTopics.lp}];
  // An older event ABI must not silently produce a convincing zero total.
  for (const source of sources) {
    let code = await rpc.code(source.address as Address, BigInt(report.evidence!.blockNumber));
    const proxy = code?.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i);
    if (proxy) code = await rpc.code(`0x${proxy[1]}`, BigInt(report.evidence!.blockNumber));
    if (!code?.toLowerCase().includes(source.topic.slice(2))) throw Error("Historical fee event implementation is not covered");
  }
  if (BigInt(history.nextBlock) > 0n && (await rpc.block(BigInt(history.nextBlock) - 1n)).hash !== history.throughHash) {
    history = await repo.command<FeeHistory>("fee_history_commit", {id, revision: history.revision, nextBlock: "0", throughHash: null, tokenTotal: "0", quoteTotal: "0", reset: true});
  }
  const startedAtBlock = history.nextBlock;
  if (history.nextBlock === "0") {
    // Verified factory-created hooks/lockers are immutable. Locate the first
    // block containing either contract, so genesis-to-deployment is known zero
    // without thousands of empty log requests. Failed archive reads abort.
    let low = 0n, high = BigInt(history.targetBlock);
    const exists = async (block: bigint) => (await Promise.all(sources.map(s => rpc.code(s.address as Address, block)))).some(code => !!code && code !== "0x");
    if (!await exists(high)) throw Error("Fee contracts absent at historical target");
    while (low < high) {const mid = (low + high) / 2n; if (await exists(mid)) high = mid; else low = mid + 1n;}
    if (low > 0n) {
      const before = await rpc.block(low - 1n);
      if (await exists(low - 1n)) throw Error("Fee contract deployment boundary changed");
      history = await repo.command<FeeHistory>("fee_history_commit", {id, revision: history.revision, nextBlock: String(low), throughHash: before.hash, tokenTotal: "0", quoteTotal: "0"});
    }
  }
  const deadline = Date.now() + 90000;
  let learnedSpan = 5000n;
  for (let step = 0; step < 20 && Date.now() < deadline && BigInt(history.nextBlock) <= BigInt(history.targetBlock); step++) {
    const from: bigint = BigInt(history.nextBlock), target: bigint = BigInt(history.targetBlock);
    let span: bigint = learnedSpan, through: bigint = from + span - 1n < target ? from + span - 1n : target;
    let logs: FeeLog[];
    let before: Awaited<ReturnType<typeof rpc.block>>;
    for (;;) {
      before = await rpc.block(through);
      try {
        const batches = await Promise.all(sources.map(async source => {
          const filter = {address: source.address as Address, topics: [source.topic], fromBlock: toHex(from), toBlock: toHex(through)};
          let rows: FeeLog[] | undefined;
          const firstProvider = preferred;
          for (let attempt = 0; attempt < clients.length; attempt++) {
            const index = (firstProvider + attempt) % clients.length;
            try {
              const raw = await clients[index].request({method: "eth_getLogs", params: [filter]});
              if (raw.length >= 1000) continue;
              rows = raw.map(row => {
                if (!row.blockNumber || !row.blockHash || !row.transactionHash || row.logIndex === null) throw Error("Unmined fee event");
                return {...row, blockNumber: BigInt(row.blockNumber), logIndex: Number(BigInt(row.logIndex))} as FeeLog;
              });
              preferred = index; break;
            } catch {/* Another verified provider may permit this same range. */}
          }
          if (!rows) throw Error("Fee history range unavailable on configured providers");
          return rows;
        }));
        logs = batches.flat(); break;
      } catch (error) {
        if (through === from || Date.now() >= deadline) throw error;
        span = (through - from + 1n) / 2n;
        learnedSpan = span;
        through = from + span - 1n;
      }
    }
    const totals = sumFeeLogs(binding, logs, from, through);
    if ((await rpc.block(through)).hash !== before.hash || from > 0n && (await rpc.block(from - 1n)).hash !== history.throughHash) throw Error("Fee history observation changed");
    history = await repo.command<FeeHistory>("fee_history_commit", {id, revision: history.revision, nextBlock: String(through + 1n), throughHash: before.hash, tokenTotal: String(BigInt(history.tokenTotal) + totals.token), quoteTotal: String(BigInt(history.quoteTotal) + totals.quote)});
  }
  return {pending: BigInt(history.nextBlock) <= BigInt(history.targetBlock), progressed: history.nextBlock !== startedAtBlock};
}
