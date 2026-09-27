import { randomUUID } from "node:crypto";
import { type Hex } from "viem";
import { BridgeReads, bridgeClient } from "../bridge/read";
import { prepare, revalidate, exactBridgeAmount } from "../bridge/prepare";
import { status } from "../bridge/status";
import {
  same,
  type Prepared,
  type Route,
  type BridgeChain,
} from "../bridge/contracts";
import type { RecoveryResult } from "../bridge/recovery";
import { activeStep, ApiError, type Job, type JobInput } from "./model";
import { jobId } from "./auth";
import type { JobStore } from "./store";
export type EngineReads = {
  account(chain: BridgeChain, account: JobInput["account"]): Promise<void>;
  route(chain: BridgeChain, token: JobInput["token"]): Promise<Route | null>;
  prepare: typeof prepare;
  revalidate: typeof revalidate;
  status(chain: BridgeChain, hash: Hex): Promise<RecoveryResult>;
  transaction(
    chain: BridgeChain,
    hash: Hex,
  ): Promise<{
    from: string;
    to: string | null;
    input: string;
    value: bigint;
    nonce: number;
  }>;
};
export const liveReads: EngineReads = {
  account: async (chain, account) => {
    const r = new BridgeReads();
    const codes = await Promise.all([
      r.code(chain, account),
      r.code(chain === 5042 ? 8453 : 5042, account),
    ]);
    if (codes.some((c) => c !== "0x"))
      throw new ApiError(
        "unsupported_wallet",
        "Use an external EOA without contract code on both chains",
        400,
      );
    await r.canonical();
  },
  route: async (chain, token) => {
    const r = new BridgeReads();
    const route = await r.route(chain, token);
    await r.canonical();
    return route;
  },
  prepare,
  revalidate,
  status,
  transaction: (chain, hash) => bridgeClient(chain).getTransaction({ hash }),
};
function ensureRoute(route: Route | null): asserts route is Route {
  if (!route) throw new ApiError("token_not_found", "Token not found", 400);
  if (!route.compatible)
    throw new ApiError("token_blocked", route.reason || "Token blocked", 400);
}
function checkLimits(p: Prepared, i: JobInput) {
  if (
    BigInt(p.circleFee) > BigInt(i.maxForwardingFeeAtomic) ||
    BigInt(p.gasBudget) > BigInt(i.maxGasBudgetAtomic)
  )
    throw new ApiError(
      "fee_limit_exceeded",
      "Current forwarding fee or gas budget exceeds the wallet-authorized per-transaction limit",
    );
}
export function matches(
  p: Prepared,
  t: {
    from: string;
    to: string | null;
    input: string;
    value: bigint;
    nonce: number;
  },
) {
  return (
    same(t.from, p.intent.account) &&
    t.nonce === p.nonce &&
    same(t.to || "", p.to) &&
    same(t.input, p.data) &&
    t.value === BigInt(p.value)
  );
}
export class BridgeEngine {
  constructor(
    private store: JobStore,
    private reads: EngineReads = liveReads,
  ) {}
  async create(intent: JobInput, paymentId: string) {
    await this.reads.account(intent.chain, intent.account);
    const route = await this.reads.route(intent.chain, intent.token);
    ensureRoute(route);
    if (intent.mode === "transfer")
      exactBridgeAmount(intent.amount, route.decimals);
    if (route.state !== "ready" && !intent.allowSetup)
      throw new ApiError(
        "setup_required",
        "No complete ownerless bridge exists. Authorize allowSetup to create one.",
      );
    const now = Date.now();
    return this.store.create({
      id: jobId(intent),
      paymentId,
      intent,
      revision: 0,
      state: "ready",
      steps: [],
      route,
      message:
        "Job created. Request the next step; no blockchain transaction has been sent.",
      createdAt: now,
      updatedAt: now,
    });
  }
  async get(id: string) {
    const j = await this.store.get(id);
    if (!j) throw new ApiError("job_not_found", "Job not found", 404);
    return j;
  }
  private save(j: Job, reservation: "keep" | "acquire" | "release" = "keep") {
    const expected = j.revision;
    j.revision++;
    j.updatedAt = Date.now();
    return this.store.save(j, expected, reservation);
  }
  async next(id: string) {
    const j = await this.get(id),
      step = activeStep(j);
    if (["complete", "failed"].includes(j.state)) return j;
    if (step && ["armed", "submitted"].includes(step.state))
      throw new ApiError(
        "transaction_unresolved",
        "Submit or reconcile the saved transaction before requesting another step.",
      );
    const route = await this.reads.route(j.intent.chain, j.intent.token);
    ensureRoute(route);
    j.route = route;
    if (route.state === "ready" && j.intent.mode === "setup") {
      j.state = "complete";
      j.message =
        "Ownerless bridge and wrapper verified. Create a transfer job to bridge tokens.";
      return this.save(j);
    }
    if (route.state !== "ready" && !j.intent.allowSetup)
      throw new ApiError(
        "setup_required",
        "Bridge setup is required and was not authorized.",
      );
    if (j.steps.length >= 16)
      throw new ApiError(
        "step_limit",
        "Job step limit reached; reconcile its history before continuing.",
      );
    const action = route.state === "ready" ? "transfer" : route.state;
    const p = await this.reads.prepare({
      chain: j.intent.chain,
      token: j.intent.token,
      account: j.intent.account,
      action,
      amount: action === "transfer" ? j.intent.amount : "0",
      riskAcknowledged: true,
    });
    checkLimits(p, j.intent);
    const next = { id: randomUUID(), prepared: p, state: "quoted" as const };
    if (step?.state === "quoted") j.steps[j.steps.length - 1] = next;
    else j.steps.push(next);
    j.state = "awaiting_signature";
    j.message = `Review ${p.step}, then call arm with this stepId immediately before signing.`;
    return this.save(j);
  }
  async arm(id: string, stepId: string) {
    const j = await this.get(id),
      s = activeStep(j);
    if (
      !s ||
      s.id !== stepId ||
      !["quoted", "armed"].includes(s.state) ||
      ["complete", "failed"].includes(j.state)
    )
      throw new ApiError(
        "step_changed",
        "Read the current job before signing.",
      );
    checkLimits(s.prepared, j.intent);
    await this.reads.revalidate(s.prepared);
    if (s.state === "armed") return j; // A lost arm response recovers the identical transaction.
    s.state = "armed";
    j.state = "awaiting_submission";
    j.message =
      "Sign and broadcast this exact transaction with your external wallet, then submit its hash. Preserve it if the wallet response is interrupted.";
    return this.save(j, "acquire");
  }
  async submit(id: string, stepId: string, hash: Hex) {
    const j = await this.get(id),
      s = activeStep(j);
    if (!s || s.id !== stepId)
      throw new ApiError("step_changed", "Unknown or superseded step");
    if (s.hash && same(s.hash, hash)) return this.refresh(id);
    if (!["armed", "submitted"].includes(s.state))
      throw new ApiError(
        "step_not_armed",
        "Arm the step before submitting a transaction",
      );
    const tx = await this.reads.transaction(j.intent.chain, hash);
    if (!same(tx.from, j.intent.account) || tx.nonce !== s.prepared.nonce)
      throw new ApiError(
        "wrong_transaction",
        "Transaction sender or nonce does not match this step",
        400,
      );
    const matchingPlan = [s.prepared, ...(s.previousPlans || [])].find((p) =>
      matches(p, tx),
    );
    if (!matchingPlan) {
      const observed = await this.reads.status(j.intent.chain, hash);
      if (
        !observed.binding?.finalized ||
        !same(observed.binding.from, j.intent.account) ||
        observed.binding.nonce !== s.prepared.nonce
      )
        throw new ApiError(
          "replacement_unconfirmed",
          "A different transaction can only resolve this step after source finality",
        );
      s.previousHashes = [
        ...(s.previousHashes || []),
        ...(s.hash ? [s.hash] : []),
      ];
      s.hash = hash;
      s.observation = observed;
      s.state = "failed";
      j.state = "failed";
      j.message =
        "This step was replaced by a different finalized transaction. The job will not replay it.";
      return this.save(j, "release");
    }
    s.prepared = matchingPlan;
    if (s.hash) s.previousHashes = [...(s.previousHashes || []), s.hash];
    s.hash = hash;
    s.state = "submitted";
    j.state = "pending";
    j.message =
      "Source transaction recorded. Tracking confirmation and destination delivery.";
    await this.save(j);
    return this.refresh(id);
  }
  async renew(id: string, stepId: string) {
    const j = await this.get(id),
      s = activeStep(j);
    if (!s || s.id !== stepId || s.state !== "armed" || s.hash)
      throw new ApiError(
        "step_not_renewable",
        "Only an armed step with no recorded transaction can renew its quote",
      );
    if ((s.previousPlans?.length || 0) >= 5)
      throw new ApiError(
        "renewal_limit",
        "Reconcile this nonce before requesting further quotes",
      );
    const p = await this.reads.prepare(s.prepared.intent);
    checkLimits(p, j.intent);
    if (p.nonce !== s.prepared.nonce || p.step !== s.prepared.step)
      throw new ApiError(
        "nonce_changed",
        "Cannot renew a different step or nonce; reconcile the saved transaction",
      );
    // Older signed variants remain valid evidence. Every variant consumes the SAME nonce.
    s.previousPlans = [...(s.previousPlans || []), s.prepared];
    s.prepared = p;
    j.message =
      "Quote renewed for the same nonce. Use only one transaction variant; submit the hash of whichever was mined.";
    return this.save(j, "acquire");
  }
  async refresh(id: string) {
    const j = await this.get(id),
      s = activeStep(j);
    if (
      !s?.hash ||
      ["complete", "failed"].includes(j.state) ||
      s.state !== "submitted"
    )
      return j;
    const result = await this.reads.status(j.intent.chain, s.hash),
      b = result.binding;
    if (
      b &&
      !matches(s.prepared, {
        from: b.from,
        to: b.to,
        input: b.data,
        value: BigInt(b.value),
        nonce: b.nonce,
      })
    )
      throw new ApiError(
        "receipt_mismatch",
        "Receipt does not match the saved transaction",
      );
    if (
      ["complete", "failed", "delivered", "unsupported"].includes(
        result.state,
      ) &&
      !b?.finalized
    )
      throw new ApiError(
        "finality_missing",
        "Finalized source evidence required",
      );
    s.observation = result;
    j.message = result.message;
    if (result.state === "complete") {
      s.state = "complete";
      j.state = s.prepared.step === "transfer" ? "complete" : "ready";
    } else if (["failed", "unsupported"].includes(result.state)) {
      s.state = "failed";
      j.state = "failed";
    } else
      j.state =
        result.state === "delivered"
          ? "delivered"
          : result.state === "forwarding"
            ? "forwarding"
            : "pending";
    return this.save(j, b?.finalized ? "release" : "keep");
  }
}
// Quoted calldata is withheld until arm has revalidated it and reserved the wallet.
export function publicJob(j: Job) {
  const r = j.route;
  const identity = (
    chainId: BridgeChain,
    address: string,
    role: "original" | "wrapped",
  ) => ({
    chainId,
    chain: chainId === 5042 ? "Arc" : "Base",
    address,
    role,
    isBridgedRepresentation: role === "wrapped",
  });
  return {
    ...j,
    tokens: r
      ? {
          source: identity(
            r.source,
            r.token,
            r.source === r.origin ? "original" : "wrapped",
          ),
          destination: r.counterpart
            ? identity(
                r.destination,
                r.counterpart,
                r.destination === r.origin ? "original" : "wrapped",
              )
            : null,
          original: identity(r.origin, r.original, "original"),
          operation:
            r.source === r.origin ? "lock_and_mint" : "burn_and_unlock",
        }
      : undefined,
    steps: j.steps.map((s) => ({
      id: s.id,
      state: s.state,
      hash: s.hash,
      previousHashes: s.previousHashes,
      observation: s.observation,
      quote: {
        step: s.prepared.step,
        chainId: j.intent.chain,
        expiresAt: s.prepared.expiresAt,
        to: s.prepared.to,
        nonce: s.prepared.nonce,
        circleFeeAtomic: s.prepared.circleFee,
        gasBudgetAtomic: s.prepared.gasBudget,
        nativeCurrency: j.intent.chain === 5042 ? "USDC" : "ETH",
      },
      ...(s.state === "armed"
        ? {
            transaction: {
              chainId: j.intent.chain,
              from: j.intent.account,
              to: s.prepared.to,
              data: s.prepared.data,
              value: s.prepared.value,
              gas: s.prepared.gas,
              maxFeePerGas: s.prepared.maxFeePerGas,
              maxPriorityFeePerGas: s.prepared.maxPriorityFeePerGas,
              nonce: s.prepared.nonce,
            },
            signBefore: s.prepared.expiresAt,
          }
        : {}),
    })),
  };
}
