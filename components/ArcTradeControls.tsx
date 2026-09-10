"use client";
export function ArcTradeControls({side,disabled=false}:{side:"buy"|"sell";disabled?:boolean}) {
  return <fieldset disabled={disabled} className={`otc-form-panel arc-trade-controls${disabled?" wallet-preview-disabled":""}`}>
    <legend>{side==="buy"?"Buy":"Sell"}</legend><h3>{side==="buy"?"Buy Arc tokens":"Sell Arc tokens"}</h3>
    <label>Token contract<input placeholder="0x…" aria-label={`${side} token contract`}/></label>
    <label>Amount<input inputMode="decimal" placeholder="0.00"/></label>
    <label>Amount unit<select defaultValue={side==="buy"?"usd":"token"}><option value="usd">Dollar value ($)</option><option value="token">Token amount</option></select></label>
    <p className="otc-fine">{side==="buy"?"Pay with Arc USDC.":"Receive Arc USDC."} Trading requires an available liquidity route.</p>
    {!disabled&&<p className="otc-notice">Trade execution unavailable.</p>}
    <button type="button" className="arc-button" disabled>Review {side}</button>
  </fieldset>;
}
