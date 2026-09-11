# Arctos Bot brand assets

The silver bear replaces the previous A-shaped icon. Edited from the supplied artwork using the built-in image generation tool on 2026-09-10.

| Asset | Project path |
| --- | --- |
| Enlarged bear, navy background | `public/brand/arctos-bear-logo.png` |
| Transparent bear | `public/brand/arctos-bear-transparent.png` |
| Social banner, 1500 x 500 | `public/brand/arctos-bear-social-banner.jpg` |
| Favicon master | `public/brand/arctos-bear-favicon.png` |

User copies are saved in `C:/Users/potato/Documents/Arcbot`: `Arctos Bear Logo.png`, `Arctos Bear Transparent.png`, `Arctos Bot Bear Banner.png`, `Arctos Bear Favicon Master.png`, `Arctos Bear Favicon.png`, and `Arctos Bear Favicon.ico`. `Arc Bot Banner.png` also contains the new banner. The previous banner is preserved in `docs/brand/archive/arc-bot-banner-before-bear.png`.

The header, footer, and home hero use the transparent bear. Shared Open Graph and Twitter metadata use the bear banner. The website address remains unchanged. External X and Telegram profile images must be updated separately.

Run `node scripts/generate-brand-icons.mjs` to regenerate favicons, Apple touch icon, app icon, and existing `arcbot.png` / `arcbot-banner.png` public aliases. Resizing and icon packaging use Sharp. Artwork used the built-in tool, not the CLI.

See [generation prompts](brand/BEAR-PROMPTS.md).

Transparent PNG cleanup uses scripts/clean-bear-alpha.mjs, explicitly authorized by the user. Alpha transparency was verified; the final cutout preserves the opaque logo's geometry and shading.
