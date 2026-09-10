import { ArcTradeControls } from "./ArcTradeControls";
export function WalletControlsPreview({ loading = false }: { loading?: boolean }) {
  return <div className="wallet-dashboard">
    <div className="otc-panel-title"><p>{loading ? "Checking X connection…" : "Connect X to use your wallet."}</p><a className="arc-button" href="/api/auth/x/start?returnTo=/wallet">Connect X ↗</a></div>
    <div className="otc-wallet-balances wallet-preview-muted">{["ARC / USDC"].map(chain => <article key={chain}><p className="arc-kicker">{chain}</p><h2>—</h2><span>Available</span><dl><dt>Reserved</dt><dd>—</dd><dt>Total balance</dt><dd>—</dd></dl></article>)}</div>
    <h2>Move funds</h2>
    <div className="wallet-preview-controls">
      <ArcTradeControls side="buy" disabled/>
      <ArcTradeControls side="sell" disabled/>
      <fieldset disabled className="otc-form-panel wallet-preview-disabled"><legend>Send</legend><h3>Send from your wallet</h3>
        <p className="otc-fine">Arc network · USDC gas</p>
        <label>Asset<select defaultValue="native"><option value="native">USDC</option><option value="token">Arc token address</option></select></label>
        <label>Amount<input inputMode="decimal" placeholder="0.00" /></label>
        <label>Recipient<input placeholder="0x…" /></label>
        <button type="button" className="arc-button">Review send</button>
      </fieldset>
    </div>
    <div className="wallet-preview-muted">{["Your listings", "OTC orders", "Transactions"].map(title => <section className="otc-history" key={title}><h2>{title}</h2><p className="otc-fine">Connect X to view records.</p></section>)}</div>
  </div>;
}
