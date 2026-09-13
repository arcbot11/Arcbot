# Private-key export: existing-project deployment

The user selected the existing Vercel project and existing CDP/X credentials. `WALLET_EXPORT_RUNTIME=shared` now supports this. A new Vercel project or dedicated CDP credential is not required.

## Implemented

- Exact export hostname routing: only the four export routes work on the key host. Website, signing, OTC, static assets and arbitrary API routes return 404 there. Export routes return 404 on the main website and preview hosts.
- Shared mode uses the complete existing CDP and X OAuth credential sets. Partial dedicated overrides fail closed. Standalone broker mode preserves the prior credential separation checks.
- The standalone page retains nonce CSP, host-only export cookies, browser-only decryption, short reveal timeout, fresh numeric-provider-ID verification and transaction fences. Telegram may frame this page; normal website pages retain frame denial.
- The website checks server-side registry eligibility before displaying export controls, using the current authenticated session's owner. Client query parameters cannot select another owner. A failed check hides controls.
- Operator preflight reports configured/not-configured fields and canonical wallet eligibility without exposing secrets. Enrollment checks all manifest targets against Convex and CDP before applying changes. It does not retrieve keys or automatically enable global flags.
- `npm run keys:setup -- --prepare --project-id EXISTING_PROJECT_ID` writes a new ignored local configuration file with disabled flags and a separate random service secret. Existing setup files are never overwritten.

The requested two-wallet pilot manifest is stored locally under `.deployment-private/key-export/pilot-wallets.json`, outside Git. The existing CDP project ID remains blank and must be filled from the actual project before enrollment. No customers have been enrolled or enabled by this change.

## Checks

- 475 tests passed across 16 export, Telegram, social transaction and OTC suites. The final setup-check adjustment also passed its 14-test suite.
- Website and Convex TypeScript checks passed.
- Production build passed, including export routes and security-header rules. Existing unused-variable warnings and two local certificate-related public-data fetch warnings remain.
- Local setup check correctly reports missing export configuration. No real private key, export grant, transaction or provider message was generated.

## Remaining activation steps

1. Access the Vercel project that serves `www.argosbot.io`. The currently configured local token lists only an older unrelated project; no changes were made to that project. Team listing is forbidden for that token, so this does not establish access to the Argos project elsewhere.
2. Add `keys.argosbot.io` (or the chosen separate hostname) to the existing Argos project and configure DNS/TLS. A request to its export view currently returns 404; it is not yet a verified running export endpoint.
3. Configure shared-mode export settings on the website, and the matching export secret/origin/project/protected-address settings on Convex. Keep flags disabled during setup.
4. Add the export callback to the existing X application's allowed callbacks, retaining website sign-in callbacks. Verify Telegram's Mini App domain behavior on the chosen hostname.
5. Deploy the backend and website. Run the resumable migration using `npm run keys:setup -- --migrate`, and confirm readiness using `--check --remote`.
6. Complete the local pilot manifest's existing project IDs. Run enrollment preview, then `--execute` for only the requested accounts. Independently validate encrypted CDP interoperability using an explicitly designated disposable account and test real X/TG handoffs before customer activation. Current tests mock CDP and provider authorization.
7. Enable the website/Convex flags, rebuild the public UI flag and update Telegram command metadata as appropriate. Recheck that all other accounts remain ineligible.

Shared hosting isolates the browser origin, not the server or CDP credential. A compromise of the shared backend or existing broadly authorized CDP credential can cross that boundary. This operational tradeoff is explicit; provider ownership proof, the audited registry and encrypted-only application export still apply.
