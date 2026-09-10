# Operator launch choices

- Launch wallet: @arctos_arc, 0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC.
- Generate a cryptographically random 32-byte token salt once per launch plan. Persist and reuse it for simulation, approval and retries. No vanity address suffix.
- A separate hook salt must satisfy the V4 hook permission flags. This is a protocol requirement, not a vanity token address search.
- An X-hosted image can be the source artwork. Resolve a post link to its actual image first. Prefer pinning the image and using its IPFS URI, following the current Argus form; direct imageURI acceptance/display must be simulated and checked before launch.
- Use the current Argus ABI bundle and Portal 0x07a688a001f416cc433c68ff56aa26bc5131cc6e, not older launch diagnostics.
- Public X, Telegram and website launch commands remain disabled. No launch is authorized by this plan.

Sources checked 2026-09-10: https://arguspad.io/create and https://arguspad.io/argus-v4.json.
