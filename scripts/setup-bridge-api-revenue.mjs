// Explicit operator setup only. Creates/retrieves one named CDP account; never signs or transfers.
import { CdpClient } from "@coinbase/cdp-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
const name = "argos-bridge-api-revenue";
const account = await new CdpClient().evm.getOrCreateAccount({ name });
mkdirSync(".deployment-private", { recursive: true });
const record = { name, address: account.address, purpose: "Bridge lookup API revenue only", createdOrVerifiedAt: new Date().toISOString() };
writeFileSync(".deployment-private/bridge-api-revenue.json", JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(record));
