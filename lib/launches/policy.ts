/** Preparation is opt-in. Execution has no environment-variable bypass. */
export function launchPreparationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ARGUS_LAUNCH_PREPARATION_ENABLED === "true";
}
export const LAUNCH_EXECUTION_ENABLED = false;
export const LAUNCH_MAX_GAS = 5_000_000n;
export const LAUNCH_TOTAL_GAS_WEI = 500_000_000_000_000_000n;
export const LAUNCH_AUTHORIZATION_MS = 30 * 60_000;
export function retryableLaunchError(error: LaunchError) {
  return ["WALLET_BUSY", "IMAGE_UNAVAILABLE", "BLOCK_CHANGED", "STALE_SIMULATION", "MINING_LIMIT"].includes(error.code);
}
export const LAUNCH_TAX_BPS = 100 as const;
export const LAUNCH_DIVIDEND_MINIMUM_TOKENS = "100000" as const;
export const LAUNCH_PREVIEW_MS = 30_000;
export const LAUNCH_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export class LaunchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export function assertLaunchExecutionDisabled(): never {
  throw new LaunchError("EXECUTION_DISABLED", "Launch execution is disabled.");
}
