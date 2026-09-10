import { isArcBotHalfTotal } from "./creator-burn-percentage";

export function creatorBurnSweepAcceptedMessage(symbol: string, configuration: {status:string;bps:number;executionBps:number;tokenAddress?:string}) {
  if (configuration.status !== "pending") return null;
  return creatorBurnConfiguredMessage(symbol, configuration.bps, configuration.tokenAddress, configuration.executionBps);
}


export function creatorBurnConfiguredMessage(symbol: string, bps: number, tokenAddress?: string, executionBps = bps) {
  if (isArcBotHalfTotal(tokenAddress, executionBps)) return "Confirmed: 50% of total creator fees from $ARCBOT buy back and burn $ARCBOT starting with the next Argus fee sweep.";
  return (bps === 0
    ? `Confirmed: Creator self-buyback and burn is off for $${symbol} starting with the next Argus fee sweep. Your creator-fee share goes to the assigned wallet.`
    : `Confirmed: ${bps / 100}% of your creator-fee share from $${symbol} buys back and burns $${symbol} starting with the next Argus fee sweep.`);
}

export function creatorBurnLaunchReply(configuration: { status: string; bps: number } | null, ageMs: number) {
  if (!configuration && ageMs < 30 * 60_000) return null;
  if (configuration?.status === "pending" || configuration?.status === "confirmed") return configuration.bps === 0
    ? "Creator self-buyback and burn is off starting with the next Argus fee sweep."
    : `${configuration.bps / 100}% of your creator-fee share buys back and burns this token starting with the next Argus fee sweep.`;
  return "Action needed: The token launched, but its requested creator-fee configuration is not confirmed. Do not launch it again.";
}
