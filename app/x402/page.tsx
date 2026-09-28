import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "x402 Services | Argos Bot",
  description: "Explore Argos Bot’s x402 APIs: CTS bridge lookup through CRA and Arcus, and external-wallet bridge setup and transfers between Arc and Base.",
};

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children} <span aria-hidden="true">↗</span></a>;
}

export default function X402Page() {
  return <>
    <SiteHeader />
    <main className={styles.content}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>APIs for agents & developers</p>
        <h1>Argos Bot <span>x402</span></h1>
        <p>Connect your agent or application to Arc and Base. Check token bridges, set up new connections, and coordinate transfers through our APIs. x402 lets your software pay for each request with USDC.</p>
      </header>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="cra-title">
          <p className={styles.tag}>CRA · Bridge lookup</p>
          <h2 id="cra-title">Argos Bot CTS Bridge Lookup</h2>
          <p>Find out whether an Arc or Base token has an ownerless bridge, and identify its counterpart on the other chain. Get original and wrapped token addresses, outstanding wrapped supply, and contract verification results.</p>
          <p>For agents using CRA: lookup only, with Circle Gateway payments on Arc and direct USDC payments on Arc or Base. Check the payment requirements for currently available options.</p>
          <div className={styles.endpoints} aria-label="CRA lookup endpoints">
            <a href="/api/v1/bridge/lookup"><b>GET</b><code>www.argosbot.io/api/v1/bridge/lookup</code></a>
            <a href="/api/v1/bridge/lookup/direct"><b>GET</b><code>www.argosbot.io/api/v1/bridge/lookup/direct</code></a>
          </div>
          <div className={styles.links}>
            <Link href="/developers/bridge-api">Documentation</Link>
            <a href="/api/v1/bridge/openapi">OpenAPI</a>
            <a href="/.well-known/x402">Discovery</a>
            <ExternalLink href="https://cra-agent.tech/market">CRA marketplace</ExternalLink>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="arcus-title">
          <p className={styles.tag}>Arcus · Bridge lookup</p>
          <h2 id="arcus-title">Argos Bot CTS Bridge Lookup</h2>
          <p>Access our bridge lookup through Arcus. Check tokens on either Arc or Base and receive their original and wrapped addresses, wrapped supply, connecting contracts and verification status.</p>
          <p>Pay in Arc USDC. Use the HTTP API, or connect an x402-capable agent through Model Context Protocol (MCP). This integration provides lookup only.</p>
          <div className={styles.endpoints} aria-label="Arcus endpoints">
            <ExternalLink href="https://arcus-api.argosbot.io/v1/lookup"><b>GET</b><code>arcus-api.argosbot.io/v1/lookup</code></ExternalLink>
            <div><b>POST</b><code>arcus-api.argosbot.io/mcp</code></div>
          </div>
          <div className={styles.links}>
            <ExternalLink href="https://arcus-api.argosbot.io/llms.txt">Documentation</ExternalLink>
            <ExternalLink href="https://arcus-api.argosbot.io/openapi.json">OpenAPI</ExternalLink>
            <ExternalLink href="https://arcus-api.argosbot.io/.well-known/x402">Discovery</ExternalLink>
            <ExternalLink href="https://arcus-api.argosbot.io/.well-known/agent-registration.json">ERC-8004 identity</ExternalLink>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="bridge-title">
          <p className={styles.tag}>Standalone API · Lookup, setup & bridging</p>
          <h2 id="bridge-title">Argos Bot CTS Bridge API</h2>
          <p>Build a complete bridge workflow between Arc and Base. Look up a token’s connection, set up an ownerless bridge and wrapped token where supported, then coordinate transfers in either direction.</p>
          <p>Your external wallet signs each blockchain transaction. The API guides approvals and transfers, tracks delivery, and lets interrupted workflows resume. API charges and network gas are paid separately.</p>
          <div className={styles.endpoints} aria-label="Standalone bridge API endpoints">
            <ExternalLink href="https://bridge-api.argosbot.io/v1/lookup"><b>GET</b><code>bridge-api.argosbot.io/v1/lookup</code></ExternalLink>
            <div><b>POST</b><code>bridge-api.argosbot.io/v1/jobs</code></div>
          </div>
          <div className={styles.links}>
            <ExternalLink href="https://bridge-api.argosbot.io/llms.txt">Documentation</ExternalLink>
            <ExternalLink href="https://bridge-api.argosbot.io/openapi.json">OpenAPI</ExternalLink>
            <ExternalLink href="https://bridge-api.argosbot.io/.well-known/x402">Discovery</ExternalLink>
            <Link href="/bridge">Use the website bridge</Link>
          </div>
        </section>

        <section className={`${styles.card} ${styles.upcoming}`} aria-labelledby="fees-title">
          <p className={styles.tag}>In development · Token fees</p>
          <h2 id="fees-title">Argos Token Fee Intelligence</h2>
          <p>We’re building fee reports for Argus launch tokens: lifetime fees earned, funds awaiting a crank, creator fees ready to claim and holder funds awaiting distribution.</p>
          <p>A planned claim service will process pending fees where needed, claim creator fees and distribute a batch of eligible holder rewards, with gas paid by the service. Compact reports and commands are also planned for X and Telegram.</p>
          <p className={styles.note}>Not yet ready for public use. Documentation and payment details will be added here when the service is ready.</p>
        </section>
      </div>

      <section className={styles.guide} aria-labelledby="getting-started">
        <h2 id="getting-started">Built on Circle’s crosschain infrastructure</h2>
        <p>Our bridge services inspect or coordinate connections through Circle’s Crosschain Token Standard (CTS), CrossChainTokenService and Cross-Chain Transfer Protocol (CCTP). Lookup verifies the supported contracts and connection; it does not certify a token’s safety or provide trading liquidity.</p>
        <h3>Start with the documentation</h3>
        <p>Use OpenAPI for request schemas, prices and response formats, or the documentation for an agent-friendly overview. Lookup requests accept a <code>token</code> contract address and an optional <code>chain=arc</code> or <code>chain=base</code>. There is no default token.</p>
        <p>A valid unpaid request to a paid endpoint returns HTTP 402 payment requirements. Simply opening a link does not charge you. An x402 client authorizes payment and retries the request. POST endpoints need the documented request body and cannot be run by opening a browser link.</p>
        <p className={styles.note}>Argos Bot is an independent service. Use of Circle infrastructure does not imply Circle certification or endorsement.</p>
      </section>
    </main>
    <SiteFooter />
  </>;
}
