import styles from "./page.module.css";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import {
  apiConfig,
  DESCRIPTION,
  SERVICE_NAME,
  OFFICIAL_REFERENCES,
} from "@/lib/bridge-api/config";
export const dynamic = "force-dynamic";
export const metadata = { title: SERVICE_NAME, description: DESCRIPTION };
export default function Page() {
  const config = apiConfig();
  const direct = apiConfig("direct");
  return (
    <main>
      <SiteHeader />
      <article className={styles.content}>
        <div>
          <h1>{SERVICE_NAME}</h1>
          <p>
            Find ownerless token connections between Arc and Base through
            Circle’s Crosschain Token Standard (CTS) and CrossChainTokenService.
            Identify the original token, its wrapped counterpart, outstanding
            wrapped supply and the contracts connecting them.
          </p>
        </div>
        <p>
          {config.enabled
            ? `Available for ${config.price} USDC per lookup.`
            : `In preparation. Proposed price: ${config.price} USDC per lookup. Paid access is not enabled.`}
        </p>
        <section>
          <h2>Choose how to pay</h2>
          <p>
            Gateway: {config.price} USDC per lookup from a funded Circle Gateway
            balance on Arc.
          </p>
          <p>
            Direct: {direct.price} USDC per lookup from your Arc wallet, using a
            signed USDC authorization settled by CRA’s facilitator. No Gateway
            deposit is needed.{" "}
            {direct.enabled
              ? "Available while CRA settlement capacity allows."
              : "In preparation; direct payments are not enabled yet."}
          </p>
          <pre>GET /api/v1/bridge/lookup/direct?token=0x…&amp;chain=arc</pre>
          <p>
            CRA currently pays direct-settlement gas within its allowances. If
            direct payment is unavailable before authorizing a payment, you may
            choose Gateway. Never switch payment methods while an earlier
            payment is unresolved; recover that request first.
          </p>
        </section>
        <section>
          <h2>Circle infrastructure, identified</h2>
          <p>
            The lookup inspects CrossChainTokenService registrations and the
            associated token managers for connections using Circle’s Cross-Chain
            Transfer Protocol (CCTP). It checks contract identities, token
            bindings, ownerless configuration and pause state against the
            deployments supported by Argos Bot.
          </p>
          <p>
            Bridge lookup and API payment use separate infrastructure: CTS and
            CCTP provide the token connection being inspected; Circle Gateway
            handles the default x402 payment rail for this API. This lookup does
            not register tokens, create wrappers or execute bridge transfers.
          </p>
        </section>
        <section>
          <h2>Both directions, clearly identified</h2>
          <p>
            Submit an original token or its wrapper. Every token is labeled Arc
            or Base, original or wrapped. Arc originals can have Base wrappers;
            Base originals can have Arc wrappers. Returning a wrapper to its
            original chain is reported as burn and unlock.
          </p>
          <pre>GET /api/v1/bridge/lookup?token=0x…&amp;chain=arc</pre>
          <p>
            Use chain=base for an address on Base, or omit chain to inspect
            both. Use finality=finalized for finalized snapshots instead of the
            latest observed blocks.
          </p>
        </section>
        <section>
          <h2>What you receive</h2>
          <p>
            Original and wrapped addresses, token roles, direction, setup and
            operational status, outstanding wrapped supply,
            CrossChainTokenService and token-manager addresses, explorer links,
            and block evidence. Existing pairs are remembered; cached
            observations are explicitly timestamped and expire after 30 seconds.
          </p>
          <p>
            A missing registration is a valid result. Network failures are not
            reported as missing bridges. Verification confirms the contract
            connection; it does not certify the original token’s transfer
            behavior, liquidity or redemption safety.
          </p>
        </section>
        <section>
          <h2>Pay per request with x402</h2>
          <p>
            When enabled, an unpaid request returns HTTP 402 with payment
            requirements. An x402 client handles the authorization and retries.
            The default payment rail uses Circle Gateway with the
            @circle-fin/x402-batching SDK, accepting USDC on Arc. This service
            does not request token approvals, bridge funds or need your private
            key.
          </p>
          <p>
            Keep the signed payment private. If the response is interrupted,
            retry the identical query with the same Payment-Signature to recover
            the result for 24 hours. A pending or uncertain payment must not be
            replaced automatically. Successful no-bridge results are charged;
            lookups that fail before settlement are not submitted for payment.
          </p>
        </section>
        <section>
          <h2>Official infrastructure references</h2>
          <ul>
            {OFFICIAL_REFERENCES.map((ref) => (
              <li key={ref.url}>
                <a href={ref.url} target="_blank" rel="noreferrer">
                  {ref.title}
                </a>
              </li>
            ))}
          </ul>
          <p>
            Argos Bot is an independent project and is not affiliated with or
            endorsed by Arc or Circle. Official infrastructure references
            identify the underlying protocols; they do not imply endorsement of
            this service or any token.
          </p>
        </section>
        <p className={styles.links}>
          <a href="/api/v1/bridge/openapi">OpenAPI specification</a>
          <a href="/.well-known/x402">x402 discovery</a>
          <a href="/api/v1/bridge/health">Configuration status</a>
          <a href="/bridge">Open the bridge</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
