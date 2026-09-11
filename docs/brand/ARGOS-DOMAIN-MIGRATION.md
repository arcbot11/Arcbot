# Argos Bot domain migration

Production origin: https://www.argosbot.io

Local source now uses this domain for shared public identity, metadata/canonicals, sitemap, robots, X/TG wallet and guide links, the social transaction service, OTC worker, retired endpoint links, and Telegram setup descriptions. Tests were updated to the new origin. Historical audit documents describe their original checks.

## Verified live September 11, 2026

- Local and Convex NEXT_PUBLIC_SITE_URL both use the new domain. WALLET_SIGNER_URL is unset; signer calls derive from NEXT_PUBLIC_SITE_URL.
- New home page returns HTTP 200. X login starts with the callback https://www.argosbot.io/api/auth/x/callback.
- The social banner returns HTTP 200. The deployed canonical still names the previous domain and the newer argos-favicon.ico asset returns 404: deploy current website source.
- New Telegram endpoint accepts the configured webhook secret and rejects an empty update as malformed (400). No chat message was sent.
- Telegram @The_ArgosBot webhook and profile description were updated to the new domain. No pending updates were dropped.

## Required external completion

1. Deploy website and Convex source. Rebuild Vercel after public environment changes. Website and Convex must use the same production origin.
2. In the existing X app's OAuth 2.0 user authentication settings, register https://www.argosbot.io/api/auth/x/callback and update the website URL to https://www.argosbot.io. Keep an old callback temporarily only if supporting an intentional transition. The generated redirect has been checked; successful browser authorization has not.
3. The apex argosbot.io already redirects to www.argosbot.io (308). The old domain still serves pages (200). Keep it attached and redirect public page links to the same path on the new domain after deployment. Do not redirect live API/OAuth traffic until all integrations have moved.
4. Update X profile website, pinned links, and any manually configured BotFather domain or Telegram menu/web-app URL if present. The current Telegram menu is commands, and the bot uses X OAuth links rather than Telegram Login Widget authentication.
5. Recheck canonicals, robots, sitemap, favicon and social preview after deployment. Refresh external social preview caches as needed.

Users need to sign in on the new host because browser cookies do not transfer across domains. X IDs, Telegram IDs, CDP wallet names, signing secrets and wallet mappings must remain unchanged. Existing funds and linked identities do not require migration.
