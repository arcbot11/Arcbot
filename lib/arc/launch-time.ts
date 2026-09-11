/** viem decodes uint40 as number, while block timestamps are bigint. */
export function openingWindowEnded(blockTimestamp:bigint,launchedAt:number|bigint){
  if(typeof launchedAt==='number'&&(!Number.isSafeInteger(launchedAt)||launchedAt<0))throw Error('Invalid launch timestamp.');
  if(BigInt(launchedAt)<0n)throw Error('Invalid launch timestamp.');
  return blockTimestamp>=BigInt(launchedAt)+3n;
}
