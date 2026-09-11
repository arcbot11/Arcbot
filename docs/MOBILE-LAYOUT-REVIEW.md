# Mobile layout review — 2026-09-10

Reviewed local home, wallet, OTC market and guide in a browser at 320, 390, 430 and 768 CSS pixels. All sixteen page/width combinations fit the viewport without horizontal document overflow. Visually checked phone and tablet home, signed-out wallet controls, navigation menu, listing dialog and footer.

Changes:
- Restored mobile navigation at the 601–900px breakpoint where desktop navigation was hidden.
- Made mobile X/TG icons visible against the dark header; enlarged navigation, dismiss, percentage and footer tap targets.
- Reduced tablet hero heading size and compacted the phone header.
- Used 16px mobile input text to avoid iOS focus zoom; retained native zoom support.
- Wrapped long balances, guide commands, quote comparisons and transaction details.
- Made listing dialogs track dynamic viewport height, contain scrolling and prevent background scrolling.
- Matched signed-out wallet balance and listing labels to the current signed-in interface.

Limits: browser viewport emulation, not physical iOS/Android testing. No authenticated wallet session or financial transaction was used. Authenticated-only amount/card layouts were reviewed in source; device keyboard behavior was not directly tested.
