/** Current L1/L2/operator fee estimates, doubled for settlement-time fluctuation. */
export function escrowBaseGasBudget(estimates: bigint[], maximumPerTransfer: bigint) {
  if(estimates.length!==3||estimates.some(value=>value<=0n))throw new Error("Settlement gas estimate unavailable.");
  const allowance=estimates.reduce((max,value)=>value>max?value:max,0n)*2n;
  if(allowance>maximumPerTransfer)throw new Error("Settlement gas exceeds policy. Try again later.");
  return {perTransferWei:allowance,settlementWei:allowance*3n};
}
