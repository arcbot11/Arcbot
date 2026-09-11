# Argos Bot branding — 2026-09-10

Website pages, metadata, social cards, app manifest, navigation, footer, legal pages, wallet responses, X replies, Telegram responses, setup scripts, license and package name now use Argos Bot. The approved full-body dog and text banner replace the bear. Retired public images are archived outside the web root. Favicons and compatibility image URLs are regenerated.

Website URL remains https://www.arcchainbot.io. Account IDs, wallet mappings, signing identities, recipient addresses, service-fee recipient, support email and transaction configuration are unchanged.

## Live account check

- X bot ID 2097696306135220226 still resolves to @ArctosBot, display name Arctos Bot. Local X user credentials resolve to the separate @Arctos_Arc account. Do not change that personal account's profile or use it to reauthorize the bot.
- Telegram bot ID 8679508645 resolves to @TheArctosBot. Its live display name, description, short description , profile photo and 13 command descriptions were updated to Argos Bot. Webhook and pending updates were left untouched.
- Existing handles remain in links, command examples and invocation parsing until the account handles are confirmed. Rename the actual accounts before changing these to avoid directing users to an unrelated account.
- Website and Convex changes require their normal deployment. No production deployment was performed by this branding task.

## Validation

Production build, root and Convex TypeScript checks pass. Lint has no errors, with existing unused-variable warnings. All 280 targeted branding, Telegram and X command tests pass. A broader legacy X wallet-intent suite still expects retired launch/fee workflows and fails; the rebrand does not enable those features.

## Artwork

Built-in image generation created the circular dog favicon and transparent cutout from the approved full-body dog. The user explicitly approved local cleanup, completed with scripts/clean-dog-alpha.mjs. The approved Argos Bot text banner is the social card. Source and exported copies are in the parent Arcbot folder. The text-free Odysseus banner remains separate artwork.
