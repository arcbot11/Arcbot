// Compatibility preload. arcTransport owns pacing; do not throttle twice.
const endpoint = process.env.ARC_MAINNET_RPC_URL;
if (!endpoint) throw new Error('ARC_MAINNET_RPC_URL is missing in .env.local.');
process.env.ARC_INFURA_RPC_URL = '';
