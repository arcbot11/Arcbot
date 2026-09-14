/** Fixed local preparation errors. Never expose provider diagnostics or URLs. */
export function tradePreparationError(error:unknown):string|undefined {
  const message=error instanceof Error?error.message:"";
  if(message==="Invalid slippage.")return "Use slippage between 0% and 10%.";
  if(["Unsupported Argus pool configuration.","Hook execution requires a reviewed adapter","This token's quote asset is not supported yet."].includes(message))return "This token's trading pair is not supported yet.";
  if(message==="No supported liquid Arc route found.")return "No supported trading route has liquidity for this token pair.";
  if(["Trade funding changed or expired. Get a new estimate before submitting.","This token uses a different quote asset. Check its trading pair.","Quote asset decimals changed. Try again.","Not enough quote tokens for this buy.","Specify a dollar amount or quote-token amount to buy."].includes(message))return message;
  return undefined;
}
