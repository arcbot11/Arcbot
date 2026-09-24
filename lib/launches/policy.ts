/** Preparation is opt-in. Execution has no environment-variable bypass. */
export function launchPreparationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ARGUS_LAUNCH_PREPARATION_ENABLED === "true";
}
export const LAUNCH_EXECUTION_ENABLED = true;
export const LAUNCH_MAX_GAS = 5_000_000n;
// Portal 8 creates full contracts through factories (verified launch: 7,859,343 gas).
// Keep the independent 0.5 USDC aggregate gas-spend ceiling.
export const PORTAL8_MAX_GAS = 12_000_000n;
export const LAUNCH_TOTAL_GAS_WEI = 500_000_000_000_000_000n;
export const LAUNCH_AUTHORIZATION_MS = 30 * 60_000;
export function retryableLaunchError(error: LaunchError) {
  return ["WALLET_BUSY", "IMAGE_UNAVAILABLE", "BLOCK_CHANGED", "STALE_SIMULATION", "MINING_LIMIT"].includes(error.code);
}
export const LAUNCH_TAX_BPS = 100 as const;
export const LAUNCH_MIN_DEV_BUY_USDC = "4.50";
export const LAUNCH_FUNDING_MESSAGE = "Not enough gas for fees and minimum 4.50 USDC dev buy. Add enough USDC for your full dev buy plus fees.";
export const LAUNCH_DIVIDEND_MINIMUM_TOKENS = "100000" as const;
export const LAUNCH_PREVIEW_MS = 30_000;
export const LAUNCH_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export class LaunchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
/** Public wording shared by website and X; technical error codes remain internal. */
export function launchUserMessage(error: LaunchError): string {
  if (error.code === "BALANCE" && !/paired|Not enough (?!USDC|funds)/i.test(error.message)) return LAUNCH_FUNDING_MESSAGE;
  if (["PORTAL_CHANGED", "POINTER_CHANGED", "HOOK_CHANGED", "REWARD_MODE"].includes(error.code)) return "Launch settings have changed. Please try again later.";
  if (["PREDICTION", "MINING_LIMIT"].includes(error.code)) return "Your token could not be prepared. Try again.";
  if (["BLOCK_CHANGED", "STALE_SIMULATION"].includes(error.code)) return "Your launch estimate needs refreshing. Check it again before continuing.";
  if (error.code === "SIMULATION_REVERTED") return "The launch check failed. Review your settings and balance before trying again.";
  if (error.code === "EXECUTION_DISABLED") return "Launching is paused. Please try again later.";
  if (error.code === "ALREADY_DEPLOYED") return "This launch may already be complete. Check its saved status before starting another.";
  if (["QUOTE_PRICE", "QUOTE_HISTORY"].includes(error.code)) return "A reliable price for the paired token is not available. Try again later or choose USDC.";
  if (error.code === "PAYOUT_CHANGED") return "Rewards for this paired token are not supported. Choose another pair.";
  return error.message;
}
export function assertLaunchExecutionDisabled(): never {
  throw new LaunchError("EXECUTION_DISABLED", "Launch execution is disabled.");
}
