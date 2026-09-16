// Read-only: imports no wallet signer or transaction executor.
// node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/check-launch-readiness.mjs ADDRESS [INPUT_JSON]
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { getAddress } from 'viem';
import { arcConfigFromEnv } from '../lib/arc/config.ts';
import { createArcRpc } from '../lib/arc/rpc.ts';
import { parseLaunchInput } from '../lib/launches/input.ts';
import { verifyLaunchImage } from '../lib/launches/image-preflight.ts';
import { prepareLaunch } from '../lib/launches/prepare.ts';
import { LaunchError, LAUNCH_EXECUTION_ENABLED } from '../lib/launches/policy.ts';
let stage = 'input';
let failedRead;

async function main() {
  if (process.argv.length < 3 || process.argv.length > 4)
    throw new LaunchError('USAGE', 'Usage: check-launch-readiness.mjs ADDRESS [INPUT_JSON]');
  const address = getAddress(process.argv[2]);
  const input = parseLaunchInput(process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : {
    name: 'Read Only Check', symbol: 'SIMCHECK', devBuyUSDC: '0',
    imageURI: 'https://pbs.twimg.com/profile_images/2098226697560625155/V-fOj5yJ_400x400.jpg',
  });
  stage = 'configuration';
  const config = arcConfigFromEnv();
  const { broadcast: _broadcast, receipt: _receipt, ...reads } = createArcRpc(config);
  void _broadcast; void _receipt;
  const rpc = Object.fromEntries(Object.entries(reads).map(([method, fn]) => [method, async (...args) => {
    try { return await fn(...args); } catch (error) {
      failedRead = { method, ...(method === 'call' || method === 'estimateGas' ? { selector: args[0].data.slice(0, 10) } : {}) };
      throw error;
    }
  }]));
  const started = Date.now();
  stage = 'image';
  const image = await verifyLaunchImage(input.imageURI);
  stage = 'preparation';
  const preview = await prepareLaunch({ identity: { owner: '0', address }, input,
    tokenSalt: `0x${randomBytes(32).toString('hex')}`, config, rpc, image,
    reservedWei: 0n, activeTransaction: false });
  console.log(JSON.stringify({ readOnly: true, executionEnabled: LAUNCH_EXECUTION_ENABLED,
    elapsedMs: Date.now() - started, input, preview,
    note: 'On-chain preparation only. Application wallet reservations and social authorization are tested separately. Nothing signed or submitted.' }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
main().catch(error => {
  // RPC exceptions can embed credential-bearing endpoint URLs. Never print them.
  console.error(JSON.stringify({ readOnly: true, status: 'failed',
    stage, failedRead, errorType: error?.name,
    locations: String(error?.stack ?? '').split('\n').filter(line => /^\s+at /.test(line) && /(?:file:\/\/\/|node:)/.test(line)).slice(0, 4),
    code: error instanceof LaunchError ? error.code : 'READINESS_FAILED',
    message: error instanceof LaunchError ? error.message : 'Read-only check failed. Check configuration, input and RPC availability. Nothing signed or submitted.' }));
  process.exitCode = 1;
});
