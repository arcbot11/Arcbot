"use client";
import { useEffect, useMemo, useState } from "react";
import { ExternalTokenImage } from "./ExternalTokenImage";
import type { DirectoryToken } from "@/lib/launches/token-directory";
import styles from "./BotTokenDirectory.module.css";
const usd = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
function Sparkline({ values, negative }: { values: number[]; negative: boolean }) {
  if (values.length < 2) return <div className={styles.chartEmpty}>Chart unavailable</div>;
  const low = Math.min(...values), range = Math.max(...values) - low;
  const points = values.map((v, i) => `${i * 280 / (values.length - 1)},${range ? 53 - (v - low) / range * 46 : 30}`).join(" ");
  return <svg className={negative ? styles.negativeChart : styles.chart} viewBox="0 0 280 60" role="img" aria-label="Recent token price trend"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
}
export function BotTokenDirectory({ tokens: initialTokens, marketAvailable: initialAvailable }: { tokens: DirectoryToken[]; marketAvailable: boolean }) {
  const [tokens,setTokens]=useState(initialTokens),[marketAvailable,setMarketAvailable]=useState(initialAvailable);
  useEffect(()=>{const controller=new AbortController();let busy=false;const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{const r=await fetch("/api/launch-tokens",{cache:"no-store",signal:controller.signal});if(!r.ok)throw Error();const data=await r.json();if(!controller.signal.aborted){if(data.registryAvailable)setTokens(data.tokens);else setTokens(old=>old.map(t=>({...t,marketCap:null,volume24h:null,change24h:null,sparkline:[]})));setMarketAvailable(data.marketAvailable&&data.registryAvailable);}}catch{if(!controller.signal.aborted){setTokens(old=>old.map(t=>({...t,marketCap:null,volume24h:null,change24h:null,sparkline:[]})));setMarketAvailable(false);}}finally{busy=false;}};const timer=setInterval(()=>void refresh(),30000);return()=>{controller.abort();clearInterval(timer);};},[]);
  const [query, setQuery] = useState(""), [sort, setSort] = useState("featured");
  const visible = useMemo(() => tokens.filter(t => `${t.name} ${t.symbol} ${t.address}`.toLowerCase().includes(query.trim().replace(/^\$/, "").toLowerCase()))
    .sort((a, b) => sort === "market" ? (b.marketCap ?? -1) - (a.marketCap ?? -1) : Number(b.featured) - Number(a.featured)), [tokens, query, sort]);
  return <section className={styles.directory}>
    <header className={styles.heading}><div><p className="arc-kicker">THE ARGOS BOT COLLECTION</p><h1>Tokens on <em>Arc.</em></h1><p>Explore tokens launched with Argos Bot.</p></div><span className={styles.count}>{tokens.length} {tokens.length === 1 ? "token" : "tokens"}<span>ARC MAINNET</span></span></header>
    <div className={styles.toolbar}><label className={styles.search}><span>Search tokens</span><input type="search" placeholder="Name, ticker, or contract" value={query} onChange={e => setQuery(e.target.value)} /></label><label className={styles.sort}><span>Sort by</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Featured first</option><option value="market">Market cap</option></select></label></div>
    {!marketAvailable && <p className={styles.notice} role="status">Market data could not be refreshed. Reload to try again.</p>}
    <div className={styles.grid}>{visible.map(t => <article className={styles.card} key={t.address}>
      <div className={styles.cardTop}><div className={styles.identity}><ExternalTokenImage src={t.image} name={t.name} /><div><h2>{t.symbol}</h2><p>{t.name}</p></div></div><span className={styles.pair}>{t.pair} pair</span></div>
      <p className={styles.description}>{t.description}</p>
      <div className={styles.value}><div><span>Market cap</span><strong>{usd(t.marketCap)}</strong></div>{t.change24h !== null && <span className={t.change24h < 0 ? styles.negative : styles.positive}>{t.change24h > 0 ? "+" : ""}{t.change24h.toFixed(1)}%<small>24h</small></span>}</div>
      <Sparkline values={t.sparkline} negative={(t.change24h ?? 0) < 0} />
      <dl className={styles.metrics}><div><dt>24h volume</dt><dd>{usd(t.volume24h)}</dd></div><div><dt>Holders</dt><dd>{t.holders === null ? "—" : t.holders.toLocaleString("en-US")}</dd></div></dl>
      <div className={styles.bond}><div><span>{t.graduated ? "Graduated" : "Graduation"}</span><span>{t.progress === null ? "—" : `${t.progress.toFixed(0)}%`}</span></div><div className={styles.track}><span style={{ width: `${t.progress ?? 0}%` }} /></div></div>
      <div className={styles.cardFooter}><span title={t.address}>{t.address.slice(0, 6)}…{t.address.slice(-4)}</span><a href={`https://arguspad.io/token/${t.address}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${t.symbol} on Argus Pad`}>View token <span aria-hidden="true">↗</span></a></div>
    </article>)}</div>
    {!visible.length && <p className={styles.empty}>No tokens match your search.</p>}
  </section>;
}
