// Research-only probe. No wallet, credentials, signing, or broadcast methods.
// Run from repository root: node --use-system-ca --use-env-proxy docs/arc/probe-mainnet.mjs
import fs from 'node:fs/promises';
import { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256 } from 'viem';

const rpcUrl = 'https://arcexplorer.org/rpc';
const bundle = JSON.parse(await fs.readFile(new URL('./argus-v4.json', import.meta.url), 'utf8'));
const deployments = JSON.parse(await fs.readFile(new URL('./uniswap-5042.json', import.meta.url), 'utf8'));
const evidence = { observedAt: new Date().toISOString(), rpcUrl, checks: [] };
let id = 0;
async function rpc(method, params = []) {
  if (!['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getBalance', 'eth_gasPrice', 'eth_maxPriorityFeePerGas'].includes(method)) throw Error('Read-only methods only');
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw Error(`${body.error.code}: ${body.error.message}`);
  if (!Object.hasOwn(body, 'result')) throw Error('No RPC result');
  return body.result;
}
async function check(name, operation) {
  try { const value = await operation(); evidence.checks.push({ name, value }); console.log(name, JSON.stringify(value)); return value; }
  catch (error) { evidence.checks.push({ name, error: error.message }); console.log(name, error.message); }
}
const chainId = await check('chainId', () => rpc('eth_chainId'));
if (chainId !== '0x13b2') throw Error('Cannot verify chain 5042; refusing further probes');
const block = await check('head', async () => {
  const b = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!b) throw Error('Missing latest block');
  return { number: b.number, hash: b.hash, timestamp: b.timestamp, ageSeconds: Math.floor(Date.now()/1000) - Number(BigInt(b.timestamp)), baseFeePerGas: b.baseFeePerGas, extraData: b.extraData };
});
if (!block) throw Error('No block snapshot');
const tag = block.number;
async function read(address, signature, functionName, args = []) {
  const abi = parseAbi([signature]);
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await rpc('eth_call', [{ to: address, data }, tag]);
  return decodeFunctionResult({ abi, functionName, data: result });
}
for (const name of ['PoolManager', 'StateView', 'V4Quoter', 'UniversalRouter', 'Permit2']) {
  await check(`${name}.code`, async () => { const address = deployments.latest[name].address; const code = await rpc('eth_getCode', [address, tag]); return { address, bytes: (code.length-2)/2, keccak256: keccak256(code) }; });
}
for (const name of ['poolManager', 'quoteAsset', 'PERMIT2']) {
  await check(`portal.${name}`, () => read(bundle.addresses.portal, `function ${name}() view returns(address)`, name));
}
await check('portal.LAUNCH_STRUCT_WORDS', () => read(bundle.addresses.portal, 'function LAUNCH_STRUCT_WORDS() view returns(uint8)', 'LAUNCH_STRUCT_WORDS'));
await check('USDC.decimals', () => read(bundle.addresses.quoteAsset, 'function decimals() view returns(uint8)', 'decimals'));
await check('V4Quoter.poolManager', () => read(deployments.latest.V4Quoter.address, 'function poolManager() view returns(address)', 'poolManager'));
await check('gasPrice', () => rpc('eth_gasPrice'));
await check('priorityFee', () => rpc('eth_maxPriorityFeePerGas'));
const tokens = await check('portal.getTokens', () => read(bundle.addresses.portal, 'function getTokens(uint256 offset,uint256 limit) view returns(address[])', 'getTokens', [0n, 1n]));
if (tokens?.length) {
  const token = tokens[0];
  await check('sampleToken.launch', async () => {
    const abi = bundle.contracts.ArgusV4HookedPortal.abi;
    const data = encodeFunctionData({ abi, functionName: 'launches', args: [token] });
    const result = await rpc('eth_call', [{ to: bundle.addresses.portal, data }, tag]);
    const launch = decodeFunctionResult({ abi, functionName: 'launches', data: result });
    return { token, fields: launch.map(x => typeof x === 'bigint' ? x.toString() : x) };
  });
}
await fs.writeFile(new URL('./mainnet-probe.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
