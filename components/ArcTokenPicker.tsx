"use client";
import { useEffect, useId, useState } from "react";
import { searchArcTokens, type SearchToken } from "@/lib/arc/token-search";

let catalogRequest: Promise<SearchToken[]> | undefined;
let catalogExpiresAt = 0;
function catalog() {
  if (Date.now() >= catalogExpiresAt) { catalogRequest = undefined; catalogExpiresAt = Date.now() + 60000; }
  return catalogRequest ??= fetch("/api/tokens", { signal: AbortSignal.timeout(10000) }).then(async r => {
    if (!r.ok) throw new Error("Token index unavailable");
    return (await r.json()).tokens as SearchToken[];
  }).catch(error => { catalogRequest = undefined; throw error; });
}
export function ArcTokenPicker({ label, value, onChange, disabled }: { label: string; value: string; onChange: (address: string) => void; disabled: boolean }) {
  const id=useId(),[text,setText]=useState(value),[tokens,setTokens]=useState<SearchToken[]>([]),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[failed,setFailed]=useState(false),[loading,setLoading]=useState(false);
  useEffect(()=>{if(disabled)return;let alive=true;setLoading(true);catalog().then(t=>{if(alive){setTokens(t);setFailed(false);}}).catch(()=>{if(alive)setFailed(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[disabled]);
  const matches=searchArcTokens(tokens,text);
  const choose=(token:SearchToken)=>{setText(token.symbol);onChange(token.address);setOpen(false);setActive(-1);};
  return <div className="arc-token-picker">
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open&&active>=0&&matches[active]?`${id}-${active}`:undefined}
      autoComplete="off" spellCheck={false} disabled={disabled} value={text} placeholder="Ticker, name, or 0x…"
      onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)}
      onChange={e=>{const next=e.target.value;setText(next);setActive(-1);setOpen(true);onChange(/^0x[0-9a-fA-F]{40}$/.test(next.trim())?next.trim():"");}}
      onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);return;}if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(n=>matches.length?(n+(e.key==="ArrowDown"?1:-1)+matches.length)%matches.length:-1);}if(e.key==="Enter"&&open&&matches[active]){e.preventDefault();choose(matches[active]);}}}/>
    {open&&!disabled&&<ul id={`${id}-results`} role="listbox" className="arc-token-results">
      {matches.map((t,i)=><li id={`${id}-${i}`} key={t.address} role="option" aria-selected={i===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(t)}><strong>{t.symbol}</strong><span>{t.name}</span><small>{t.address}</small></li>)}
      {!matches.length&&<li role="presentation">{loading?"Loading tokens…":failed?"Index unavailable. Paste a contract address.":"No indexed token found. Paste a contract address."}</li>}
    </ul>}
    <small className="arc-token-selection">{value?`Contract: ${value}`:"Select a token or paste its contract address."}</small>
  </div>;
}
