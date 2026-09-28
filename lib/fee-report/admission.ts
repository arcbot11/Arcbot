import {
  ALL_DAILY_GAS_CAP,
  FREE_DAILY_GAS_CAP,
  FREE_CLAIMS_PER_HOUR,
  FEE_JOB_GAS_CAP,
  TOKEN_COOLDOWN_MS,
  feePrincipal,
  type FeeChannel,
} from "./policy";

export type FeeAdmission = {
  id: string;
  channel: FeeChannel;
  principal: string;
  token: string;
  createdAt: number;
  /** Unresolved jobs retain their full reservation, even across day boundaries. */
  active: boolean;
  actualGasWei?: string;
  completedAt?: number;
};
export const DAY_MS = 86_400_000;

export function feeAdmissionInput(
  id: string,
  channel: FeeChannel,
  owner: string,
  token: string,
) {
  if (
    !/^[A-Za-z0-9:_-]{1,180}$/.test(id) ||
    !["x402", "x", "telegram"].includes(channel) ||
    !/^0x[\da-f]{40}$/i.test(token) ||
    /^0x0{40}$/i.test(token)
  )
    throw Error("Invalid fee workflow request.");
  return {
    id,
    channel,
    principal: feePrincipal(channel, owner),
    token: token.toLowerCase(),
  };
}

/** Run inside one database mutation: replay checks, quota and reservation are atomic. */
export function admitFeeWorkflow(
  input: ReturnType<typeof feeAdmissionInput>,
  records: FeeAdmission[],
  now: number,
): { existing: boolean; job: FeeAdmission } {
  if (!Number.isSafeInteger(now) || now <= 0)
    throw Error("Invalid admission time.");
  const previous = records.find((r) => r.id === input.id);
  if (previous) {
    if (
      previous.token !== input.token ||
      previous.principal !== input.principal ||
      previous.channel !== input.channel
    )
      throw Error("Fee request ID is already bound to different inputs.");
    return { existing: true, job: previous };
  }
  if (
    records.some(
      (r) =>
        r.token === input.token &&
        (r.active || r.createdAt + TOKEN_COOLDOWN_MS > now),
    )
  )
    throw Error("This token already has a fee workflow or is on cooldown.");
  const free = input.channel !== "x402";
  if (
    free &&
    records.filter(
      (r) =>
        r.channel !== "x402" &&
        r.principal === input.principal &&
        r.createdAt + 3_600_000 > now,
    ).length >= FREE_CLAIMS_PER_HOUR
  )
    throw Error("Free claims are limited to three per user per hour.");
  let all = 0n,
    social = 0n;
  for (const record of records) {
    // Missing receipt accounting never releases a reservation.
    if (
      record.actualGasWei !== undefined &&
      !/^(0|[1-9][0-9]*)$/.test(record.actualGasWei)
    )
      throw Error("Invalid recorded fee gas.");
    if (
      record.completedAt !== undefined &&
      (!Number.isSafeInteger(record.completedAt) ||
        record.completedAt < record.createdAt ||
        record.completedAt > now)
    )
      throw Error("Invalid fee completion time.");
    // Count settled gas from finality, not admission. A job may remain pending
    // for over a day before its receipt becomes final.
    if (
      !record.active &&
      record.actualGasWei !== undefined &&
      record.completedAt !== undefined &&
      record.completedAt + DAY_MS <= now
    )
      continue;
    const gas =
      record.active ||
      record.actualGasWei === undefined ||
      record.completedAt === undefined
        ? FEE_JOB_GAS_CAP
        : BigInt(record.actualGasWei);
    all += gas;
    if (record.channel !== "x402") social += gas;
  }
  if (
    all + FEE_JOB_GAS_CAP > ALL_DAILY_GAS_CAP ||
    (free && social + FEE_JOB_GAS_CAP > FREE_DAILY_GAS_CAP)
  )
    throw Error("Fee service gas budget reached. Try again later.");
  return { existing: false, job: { ...input, createdAt: now, active: true } };
}
