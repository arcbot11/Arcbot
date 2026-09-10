import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import Link from "next/link";

const examples = [
  ["Buy", "Buy $25 of TOKEN", "Buy 50 TOKEN", "Use USDC to buy an Arc token."],
  ["Sell", "Sell $25 of TOKEN", "Sell 50 TOKEN", "Sell tokens back to USDC."],
  ["Swap", "Swap $25 of TOKEN_A for TOKEN_B", "Swap 50 TOKEN_A for TOKEN_B", "Choose the input token, amount, and output token."],
  ["Send", "Send $25 of TOKEN to 0x…", "Send 50 TOKEN to 0x…", "Check the destination and amount."],
  ["Burn", "Burn $25 of TOKEN", "Burn 50 TOKEN", "Send tokens to the dead address. This cannot be undone."],
];

export default function Guide() {
  return <main><SiteHeader /><section className="arc-container arc-guide">
    <p className="arc-kicker">THE FIELD GUIDE</p>
    <h1>Say it.<br /><em>Check it.</em></h1>
    <p className="arc-intro">Direct commands. Deliberate actions.</p>

    <p className="arc-intro">Use a dollar value or a token amount. Dollar values require a current token price. The examples below are separate amounts.</p>
    <div className="arc-command-list">{examples.map(([name, dollars, tokens, description], i) =>
      <article key={name}><span>0{i + 1}</span><h2>{name}</h2><div>
        <dl className="arc-command-examples"><dt>Dollar value</dt><dd><code>{dollars}</code></dd><dt>Token amount</dt><dd><code>{tokens}</code></dd></dl>
        <p>{description}</p>
      </div></article>
    )}</div>
    <Link className="arc-button" href="/wallet">Open wallet ↗</Link>
  </section><SiteFooter /></main>;
}
