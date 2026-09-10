# OTC escrow provisioning fix

Read-only Convex inspection found the 50 USDC listing `listing:2097782568934371330:84b6d886-7750-4caf-a850-fa46feb7fbe2` in `funding`, without an escrow address or funding transaction. CDP lookup found no account under its recorded name, `arc-otc-9e1204960f9fa6d860b57d82d990d09e`.

The name was 40 characters. [CDP account names allow 2–36 characters](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/evm-accounts/get-evm-account-by-name). The SDK looks up an account and then attempts creation after a 404, so this invalid generated name prevents provisioning.

New names use `otc-` plus the same 32 hexadecimal hash characters: exactly 36 characters, retaining the original 128-bit position identity. A funding position with the exact legacy name and no address uses the corrected name on retry. Convex updates the name with the first address binding. Existing address bindings remain immutable; reservation amounts and funding transaction IDs remain unchanged. Repeated workers get the same CDP account and transaction ID.

Deploy the Convex change and website change for production recovery. This investigation did not create accounts, alter production records, sign transactions or send funds. The current listing remains pending until the deployed worker can resume it. Other funding checks, including gas and wallet reservations, still apply.

Regression coverage checks name length/format, deterministic names, legacy recovery, name forgery rejection, immutable existing addresses and unchanged wallet holds.
