// This exception is tied to the asset address, never its ticker or caller name.
const ARCBOT = "0xb1e9b822b81bbbdab375f7f4d86e44fa04d12b07";
export function creatorBurnExecutionBps(tokenAddress: string, requestedBps: number) {
  // 5% + 95% * 47.37% = 50.0015%, nearest representable total to 50%.
  return tokenAddress.toLowerCase() === ARCBOT && requestedBps === 5000 ? 4737 : requestedBps;
}

export function isArcBotHalfTotal(tokenAddress: string | undefined, executionBps: number) {
  return tokenAddress?.toLowerCase() === ARCBOT && executionBps === 4737;
}
