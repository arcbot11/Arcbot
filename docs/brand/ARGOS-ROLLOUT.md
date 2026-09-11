# Argos Bot branding — 2026-09-10

> Historical audit. Account and deployment observations below are superseded by `docs/readiness-followup-2026-09-11.md`. Current public identities are in `lib/project-config.ts`.

Website pages, metadata, social cards, app manifest, navigation, footer, legal pages, wallet responses, X replies, Telegram responses, setup scripts, license and package name now use Argos Bot. The approved full-body dog and text banner replace the bear. Retired public images are archived outside the web root. Favicons and compatibility image URLs are regenerated.

Website URL is https://www.argosbot.io. X account IDs, wallet mappings, signing identities, recipient addresses, service-fee recipient, support email and transaction configuration are unchanged.

## Live account check

- X bot ID 2097696306135220226 now resolves to @TheArgosBot, display name Argos Bot, verified through the X API after the user supplied the new handle. Local X user credentials resolve to the separate @0xTheOdysseus account. Bot posting credentials must be authorized as @TheArgosBot.
- Telegram was replaced by @The_ArgosBot, verified bot ID 8280311402. Name, descriptions, dog profile image, 13 commands and the production webhook were configured. Existing pending Telegram updates were preserved.
- X links, metadata, command examples and invocation parsing now use @TheArgosBot. Telegram links and addressed commands now use the verified @The_ArgosBot handle.
- Website and Convex changes require their normal deployment. No production deployment was performed by this branding task.

## Validation

Production build, root and Convex TypeScript checks pass. Lint has no errors, with existing unused-variable warnings. All 280 targeted branding, Telegram and X command tests pass. A broader legacy X wallet-intent suite still expects retired launch/fee workflows and fails; the rebrand does not enable those features.

## Artwork

Built-in image generation created the circular dog favicon and transparent cutout from the approved full-body dog. The user explicitly approved local cleanup, completed with scripts/clean-dog-alpha.mjs. The approved Argos Bot text banner is the social card. Source and exported copies are in the parent Arcbot folder. The text-free Odysseus banner remains separate artwork.
