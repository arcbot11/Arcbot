import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { boundedJson } from "@/lib/bounded-json";
import { websiteSession, json, webFailure, WebError } from "@/lib/otc/http";
import { repository } from "@/lib/otc/repository";
import {
  advanceTransaction,
  balanceSnapshot,
  prepareCall,
  walletTransferConfiguration,
} from "@/lib/otc/runtime";
import {
  locked,
  walletId,
  type Transaction,
  type Wallet,
} from "@/lib/otc/model";
import { prepare, revalidate, verifySeal } from "@/lib/bridge/prepare";
import { arcConfigFromEnv } from "@/lib/arc/config";
import { baseConfigFromEnv } from "@/lib/base/config";
import { intentSchema, preparedSchema } from "@/lib/bridge/validation";
import { botBridgeUnsigned } from "@/lib/bridge/bot-call";
import { same, type Prepared } from "@/lib/bridge/contracts";
export const runtime = "nodejs";
export const maxDuration = 120;
const schema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("prepare"),
      intent: intentSchema.omit({ account: true }),
    })
    .strict(),
  z
    .object({ operation: z.literal("confirm"), prepared: preparedSchema })
    .strict(),
]);
const idFor = (owner: string, p: Prepared) =>
  "bridge:" +
  createHash("sha256")
    .update(JSON.stringify([owner, p.seal]))
    .digest("hex");
export async function POST(request: NextRequest) {
  try {
    const session = await websiteSession(request, true);
    const raw = await boundedJson(request, 50_000);
    const input = schema.parse(raw),
      repo = repository();
    if (input.operation === "prepare") {
      walletTransferConfiguration(input.intent.chain);
      const p = await prepare({
        ...input.intent,
        account: session.walletAddress,
      });
      const w = await repo.read<Wallet | null>({
        id: walletId(p.intent.chain, session.walletAddress),
      });
      if (w?.activeTx)
        throw new WebError(
          "Wallet has an outstanding transaction. Resolve it in your wallet first.",
        );
      const snap = await balanceSnapshot(p.intent.chain, session.walletAddress);
      if (
        BigInt(snap.balanceWei) - (w ? locked(w) : 0n) <
        BigInt(p.value) + BigInt(p.gasBudget)
      )
        throw new WebError(
          "Not enough available funds for bridge fees and gas.",
        );
      return json({ prepared: p, id: idFor(session.owner, p) });
    }
    // Preserve object ordering: the original sealed bytes, not Zod's reordered copy.
    const p = (raw as { prepared: Prepared }).prepared;
    if (!same(p.intent.account, session.walletAddress))
      throw new WebError("Bridge wallet mismatch.", 403);
    verifySeal(p, true);
    const id = idFor(session.owner, p);
    let tx = await repo.read<Transaction | null>({ id });
    if (
      tx &&
      (tx.owner !== session.owner ||
        !same(tx.wallet, session.walletAddress) ||
        tx.leg !== "bridge" ||
        tx.bridgeStep?.seal !== p.seal ||
        tx.unsigned !== botBridgeUnsigned(p))
    )
      throw new WebError("Bridge request mismatch.", 403);
    if (!tx) {
      const identity = {
        id,
        owner: session.owner,
        wallet: session.walletAddress,
        chainId: p.intent.chain,
        bridgeStep: p,
        unsigned: botBridgeUnsigned(p),
      };
      try {
        walletTransferConfiguration(p.intent.chain);
        const config =
          p.intent.chain === 5042 ? arcConfigFromEnv() : baseConfigFromEnv();
        if (
          BigInt(p.gas) > config.maxGas ||
          BigInt(p.maxFeePerGas) > config.maxFeePerGas
        )
          throw new WebError("Bridge gas exceeds wallet policy.");
        await revalidate(p);
        // Also enforce the bot's chain configuration, simulation and Base extra-fee policy.
        const checked = await prepareCall(p.intent.chain, {
          from: session.walletAddress,
          to: p.to,
          data: p.data,
          value: BigInt(p.value),
        });
        if (
          checked.snapshot.nonce !== p.nonce ||
          BigInt(checked.reserveWei) > BigInt(p.value) + BigInt(p.gasBudget)
        )
          throw new WebError("Bridge gas or nonce changed. Review again.");
        await revalidate(p);
        tx = await repo.command<Transaction>("prepare", {
          id,
          owner: session.owner,
          wallet: session.walletAddress,
          chainId: p.intent.chain,
          leg: "bridge",
          bridgeStep: p,
          unsigned: botBridgeUnsigned(p),
          reserveWei: (BigInt(p.value) + BigInt(p.gasBudget)).toString(),
          balanceWei: checked.snapshot.balanceWei,
          block: checked.snapshot.block,
        });
      } catch {
        // An atomic tombstone makes a failed confirmation safe to retry, even
        // if another copy of this request is still preparing on another server.
        tx = await repo.command<Transaction>("bridge_reject", identity);
      }
    }
    if (!["completed", "reverted", "cancelled"].includes(tx!.status)) {
      try {
        tx = await advanceTransaction(id);
      } catch {
        tx = await repo.read<Transaction>({ id });
      }
    }
    return json({ id: tx!.id, status: tx!.status, hash: tx!.hash });
  } catch (error) {
    return webFailure(error);
  }
}
