// Operator-only preload. Pace the configured Arc endpoint to avoid burst limits.
const endpoint = process.env.ARC_MAINNET_RPC_URL;
if (!endpoint) throw new Error('ARC_MAINNET_RPC_URL is missing in .env.local.');
process.env.ARC_INFURA_RPC_URL = '';
const original = globalThis.fetch;
let next = 0;
globalThis.fetch = async (input, init) => {
  if (String(input) === endpoint) {
    const now = Date.now(), slot = Math.max(now, next);
    next = slot + 250;
    if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
  }
  return original(input, init);
};
