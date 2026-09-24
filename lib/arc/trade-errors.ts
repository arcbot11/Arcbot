/** Inspect bounded error causes without exposing provider diagnostics. */
export function tradeSimulationFailure(error:unknown):"minimum_output"|"reverted"|undefined {
  const seen=new Set<object>();let current=error,reverted=false;
  for(let depth=0;depth<12&&typeof current==="object"&&current!==null&&!seen.has(current);depth++){
    seen.add(current);
    const e=current as {code?:unknown;name?:unknown;message?:unknown;data?:unknown;cause?:unknown};
    // V3TooLittleReceived(), or V4TooLittleReceived(minimum,received).
    if(typeof e.data==="string"&&/^(?:0x39d35496|0x8b063d73[0-9a-f]{128})$/i.test(e.data))return "minimum_output";
    if(e.code===3||e.name==="ContractFunctionRevertedError"||typeof e.message==="string"&&/execution reverted/i.test(e.message))reverted=true;
    current=e.cause;
  }
  return reverted?"reverted":undefined;
}

/** Fixed local preparation errors. Never expose provider diagnostics or URLs. */
export function tradePreparationError(error:unknown):string|undefined {
  const message=error instanceof Error?error.message:"";
  if(message==="Invalid slippage.")return "Use slippage between 0% and 10%.";
  if (["Unexpected dynamic Argus token record length.", "Dynamic Argus registry mismatch.",
    "Dynamic Argus contract code missing.", "Dynamic Argus hook identity mismatch.",
    "Unsupported dynamic Argus pool configuration.", "Dynamic Argus quote token code missing.",
    "Dynamic Argus pool ID mismatch."].includes(message))
    return "This token's trading contracts could not be verified. No trade was submitted.";
  if(["Unsupported Argus pool configuration.","Hook execution requires a reviewed adapter","This token's quote asset is not supported yet."].includes(message))return "This token's trading pair is not supported yet.";
  if(message==="No supported liquid Arc route found.")return "No supported trading route has liquidity for this token pair.";
  if(["Trade funding changed or expired. Get a new estimate before submitting.","This token uses a different quote asset. Check its trading pair.","Quote asset decimals changed. Try again.","Not enough quote tokens for this buy.","Specify a dollar amount or quote-token amount to buy."].includes(message))return message;
  return undefined;
}
