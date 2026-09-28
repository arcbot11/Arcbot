// Read-only developer entry point. No wallet or payment provider is loaded.
import { readFeeReport } from "../lib/fee-report/read.ts";
const token = process.argv[2];
if (!token) {
  console.error(
    "Usage: node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/check-fee-report.mjs <token>",
  );
  process.exitCode = 1;
} else {
  try {
    const report = await readFeeReport({ token });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "unavailable") process.exitCode = 2;
  } catch {
    console.error("Invalid token address.");
    process.exitCode = 1;
  }
}
