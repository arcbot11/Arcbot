import Link from "next/link";
import { ArcTradeControls } from "./ArcTradeControls";

/** Keep the same single-column geometry before and after session hydration. */
export function WalletControlsPreview({ loading = false }: { loading?: boolean }) {
  return <div className="wallet-dashboard" aria-busy={loading}>
    <div className="wallet-connection-slot">{loading ? <span className="otc-fine">Checking X connection…</span> : <a className="arc-text-link" href="/api/auth/x/start?returnTo=/wallet">Connect X to use your wallet ↗</a>}<button className="arc-button" disabled>View on Arc Explorer ↗</button></div>
    <div className="otc-wallet-balances wallet-preview-muted"><article><p className="arc-kicker">ARC / USDC</p><h2>— <small>USDC</small></h2><span>Available</span><dl><dt>Total balance</dt><dd>—</dd></dl></article></div>
    <div className="otc-panel-title"><h2>Move funds</h2><Link className="arc-text-link" href="/otc">Open OTC market ↗</Link></div>
    <div className="otc-tabs wallet-action-tabs" role="group" aria-label="Wallet action">{["Buy", "Sell", "Swap", "Send"].map(action => <button key={action} disabled aria-pressed={action === "Buy"}>{action}</button>)}</div>
    <ArcTradeControls side="buy" disabled/>
    <div className="wallet-preview-muted">{["Your OTC positions", "OTC orders", "Transactions"].map(title => <section className="otc-history" key={title}><h2>{title}</h2><p className="otc-fine">Connect X to view records.</p></section>)}</div>
  </div>;
}
