import { z } from "zod";
import { zeroAddress, type Hex } from "viem";
import { addressSchema, chainSchema } from "../bridge/validation";
import type { Prepared, Route } from "../bridge/contracts";
import type { RecoveryResult } from "../bridge/recovery";
const address = addressSchema
  .refine((v) => v.toLowerCase() !== zeroAddress)
  .transform((v) => v.toLowerCase() as typeof v);
const units = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) < 2n ** 256n);
export const jobInput = z
  .object({
    clientRequestId: z.string().uuid(),
    chain: chainSchema,
    token: address,
    account: address,
    mode: z.enum(["setup", "transfer"]),
    amount: z
      .string()
      .max(90)
      .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
    allowSetup: z.boolean(),
    riskAcknowledged: z.literal(true),
    maxForwardingFeeAtomic: units,
    maxGasBudgetAtomic: units,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "setup" && (v.amount !== "0" || !v.allowSetup))
      ctx.addIssue({
        code: "custom",
        message: "Setup requires amount 0 and allowSetup true",
      });
    if (v.mode === "transfer" && !/[1-9]/.test(v.amount))
      ctx.addIssue({
        code: "custom",
        message: "Transfer amount must be positive",
      });
  });
export type JobInput = z.infer<typeof jobInput>;
export const createInput = z
  .object({
    intent: jobInput,
    expiresAt: z.number().int().positive(),
    signature: z
      .string()
      .regex(/^0x[0-9a-fA-F]{130}$/)
      .transform((v) => v as Hex),
  })
  .strict();
export type Step = {
  id: string;
  prepared: Prepared;
  previousPlans?: Prepared[];
  state: "quoted" | "armed" | "submitted" | "complete" | "failed";
  hash?: Hex;
  previousHashes?: Hex[];
  observation?: RecoveryResult;
};
export type Job = {
  id: string;
  paymentId: string;
  intent: JobInput;
  revision: number;
  state:
    | "ready"
    | "awaiting_signature"
    | "awaiting_submission"
    | "pending"
    | "forwarding"
    | "delivered"
    | "complete"
    | "failed";
  steps: Step[];
  route?: Route;
  message: string;
  createdAt: number;
  updatedAt: number;
};
export const activeStep = (j: Job) => j.steps.at(-1);
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
