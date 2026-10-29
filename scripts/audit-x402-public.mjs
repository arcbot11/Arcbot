// Live, non-paying checks only. No keys, valid signatures, approvals or transactions.
// Run with: node --use-system-ca scripts/audit-x402-public.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw Error('--output requires a report path');
const out = outputIndex >= 0 ? pathToFileURL(resolve(process.argv[outputIndex + 1])) : new URL('../docs/research/x402-audit-2026-10-29.json', import.meta.url);
const startedAt = new Date().toISOString();
const BRIDGE = 'https://bridge-api.argosbot.io';
const WEB = 'https://www.argosbot.io';
const ARCUS = 'https://arcus-api.argosbot.io';
const token = '0xe86688530c456e099732f953ed7aa7c583026680';
const fakeAccount = '0x1111111111111111111111111111111111111111';
const payTo = '0x60E4834783dA4D4D7ad1C81fc48221840192152C'.toLowerCase();
const fakeJob = `ab_${'f'.repeat(48)}`;
const fakeStep = 'f48bdf7a-e360-4ac4-9151-6dc1c4927050';
const noProof = { 'Payment-Signature': 'invalid-no-payment-proof' };
const intent = { clientRequestId: randomUUID(), chain: 5042, token, account: fakeAccount,
  mode: 'setup', amount: '0', allowSetup: true, riskAcknowledged: true,
  maxForwardingFeeAtomic: '0', maxGasBudgetAtomic: '0' };
const unsignedCreate = { intent, expiresAt: Date.now() + 300_000, signature: `0x${'00'.repeat(65)}` };
const results = [];
const previous = process.argv.includes('--resume')
  ? JSON.parse(await readFile(out, 'utf8')).results : [];
let lastRequest = 0;
async function check(name, url, { method = 'GET', body, headers = {}, status = 200, validate } = {}) {
  const completed = previous.find(r => r.name === name && r.url === url && r.pass);
  if (completed) { results.push(completed); return completed; }
  // Stay below the shared 30-per-minute client cap. This is not a load test.
  const delay = Math.max(0, lastRequest + 2300 - Date.now());
  if (delay) await new Promise(r => setTimeout(r, delay));
  lastRequest = Date.now();
  const began = Date.now();
  const row = { name, method, url, expectedStatus: status };
  try {
    const response = await fetch(url, { method, redirect: 'error', headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
    }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch {}
    row.status = response.status;
    row.headers = Object.fromEntries(['content-type', 'cache-control', 'vary', 'allow', 'access-control-allow-origin', 'access-control-expose-headers', 'retry-after'].flatMap(k => response.headers.has(k) ? [[k, response.headers.get(k)]] : []));
    row.response = json ?? text.slice(0, 1000);
    assert.ok((Array.isArray(status) ? status : [status]).includes(response.status), `expected ${JSON.stringify(status)}, got ${response.status}`);
    await validate?.({ response, json, text, row });
    row.pass = true;
  } catch (e) { row.pass = false; row.error = e.message; }
  row.durationMs = Date.now() - began;
  results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${name}: ${row.status ?? 'transport'}${row.error ? ` — ${row.error}` : ''}`);
  await persist();
  return row;
}
async function persist() {
  await mkdir(new URL('.', out), { recursive: true });
  await writeFile(out, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), scope: 'Production unpaid requests only; no valid payment or wallet signatures, API purchases or chain transactions', count: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results }, null, 2));
}
function challenge(amount, resourcePrefix, networks) {
  return ({ response, json, row }) => {
    const c = json?.x402Version ? json : json?.result?.structuredContent;
    assert.equal(c?.x402Version, 2);
    assert.ok(c.accepts?.length, 'missing payment requirements');
    assert.ok(c.resource?.url.startsWith(resourcePrefix), 'unexpected payment resource');
    for (const a of c.accepts) {
      assert.equal(a.amount, amount); assert.equal(a.scheme, 'exact');
      assert.equal(a.payTo.toLowerCase(), payTo);
      assert.ok(['eip155:5042', 'eip155:8453'].includes(a.network));
      assert.ok(Number.isSafeInteger(a.maxTimeoutSeconds) && a.maxTimeoutSeconds > 0);
      // Gateway batch authorizations deliberately require a multi-day validity;
      // a short direct-payment timeout is not a valid assumption for that rail.
      if (a.extra?.name === 'GatewayWalletBatched')
        assert.ok(a.maxTimeoutSeconds >= a.extra.minValiditySeconds);
      const asset = a.network === 'eip155:5042' ? '0x3600000000000000000000000000000000000000' : '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      assert.equal(a.asset.toLowerCase(), asset);
    }
    for (const n of networks) assert.ok(c.accepts.some(a => a.network === n), `missing ${n}`);
    const h = response.headers.get('payment-required');
    if (response.status === 402) {
      assert.ok(h, 'missing PAYMENT-REQUIRED header');
      assert.deepEqual(JSON.parse(Buffer.from(h, 'base64').toString()), c);
    } else {
      assert.equal(json.result.isError, true);
      assert.equal(json.result._meta['argos/http-status'], 402);
    }
    row.paymentSummary = c.accepts.map(a => ({ network: a.network, amount: a.amount, domain: a.extra?.name, version: a.extra?.version, payTo: a.payTo }));
  };
}
const rpc = (method, params) => ({ jsonrpc: '2.0', id: randomUUID(), method, ...(params ? { params } : {}) });
const a2a = (skill, input, rail, extra = {}) => rpc('message/send', { message: { kind: 'message', role: 'user', messageId: randomUUID(), parts: [{ kind: 'data', data: { skill, input, ...(rail ? { rail } : {}) } }], ...extra } });
const mcpHeaders = { accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
const rpcError = code => ({ json }) => assert.equal(json.error?.code, code);

for (const [origin, paths] of [
  [BRIDGE, ['/', '/health', '/openapi.json', '/.well-known/x402', '/.well-known/agent-card.json', '/a2a/docs', '/llms.txt']],
  [WEB, ['/.well-known/x402', '/api/v1/bridge/openapi', '/api/v1/bridge/health']],
  [ARCUS, ['/', '/health', '/openapi.json', '/.well-known/x402', '/.well-known/agent-registration.json', '/llms.txt']],
]) for (const path of paths) await check(`metadata ${new URL(origin).hostname}${path}`, origin + path);

const lookupRoutes = [[BRIDGE + '/v1/lookup', '5000', ['eip155:5042', 'eip155:8453']],
  [BRIDGE + '/v1/lookup/direct', '7000', ['eip155:5042', 'eip155:8453']],
  [WEB + '/api/v1/bridge/lookup', '5000', ['eip155:5042', 'eip155:8453']],
  [WEB + '/api/v1/bridge/lookup/direct', '7000', ['eip155:5042', 'eip155:8453']],
  [ARCUS + '/v1/lookup', '7000', ['eip155:5042']]];
for (const [url, amount, networks] of lookupRoutes) {
  await check(`bare challenge ${url}`, url, { status: 402, validate: challenge(amount, url, networks) });
  for (const chain of ['arc', 'base']) await check(`valid ${chain} input ${url}`, `${url}?token=${token}&chain=${chain}`, { status: 402, validate: challenge(amount, url, networks) });
  await check(`invalid input ${url}`, url + '?token=invalid', { status: 400 });
  await check(`duplicate parameter ${url}`, `${url}?token=${token}&token=${token}&chain=arc`, { status: 400 });
  await check(`invalid payment encoding ${url}`, `${url}?token=${token}&chain=arc`, { headers: noProof, status: 400 });
}
for (const [path, amount] of [['/v1/jobs', '10000'], ['/v1/jobs/direct', '12000']]) {
  await check(`job discovery ${path}`, BRIDGE + path, { method: 'POST', body: {}, status: 402, validate: challenge(amount, BRIDGE + path, ['eip155:5042', 'eip155:8453']) });
  await check(`job schema rejection ${path}`, BRIDGE + path, { method: 'POST', body: {}, headers: noProof, status: 400 });
  await check(`job invalid payment rejection ${path}`, BRIDGE + path, { method: 'POST', body: unsignedCreate, headers: noProof, status: 400 });
}
await check('unsigned authorization preparation', BRIDGE + '/v1/authorization', { method: 'POST', body: intent, validate: ({ json }) => { assert.equal(json.typedData.primaryType, 'BridgeJob'); assert.equal(json.intent.account, fakeAccount); assert.equal(json.intent.maxGasBudgetAtomic, '0'); } });
await check('invalid authorization input', BRIDGE + '/v1/authorization', { method: 'POST', body: {}, status: 400 });
for (const op of ['', 'next', 'arm', 'renew', 'transactions', 'resume']) await check(`job access guard ${op || 'status'}`, `${BRIDGE}/v1/jobs/${fakeJob}${op ? '/' + op : ''}`, { method: op ? 'POST' : 'GET', ...(op ? { body: { stepId: fakeStep, hash: `0x${'0'.repeat(64)}` } } : {}), status: 401 });
await check('wrong job bearer rejected', `${BRIDGE}/v1/jobs/${fakeJob}`, { headers: { authorization: `Bearer ${'0'.repeat(64)}` }, status: 401 });

for (const rail of ['gateway', 'direct']) {
  await check(`A2A lookup ${rail}`, BRIDGE + '/a2a', { method: 'POST', body: a2a('bridge_lookup', { token, chain: 'arc' }, rail), status: 402, validate: challenge(rail === 'direct' ? '7000' : '5000', BRIDGE + '/v1/lookup', ['eip155:5042', 'eip155:8453']) });
  await check(`A2A create ${rail}`, BRIDGE + '/a2a', { method: 'POST', body: a2a('bridge_create', unsignedCreate, rail), status: 402, validate: challenge(rail === 'direct' ? '12000' : '10000', BRIDGE + '/v1/jobs', ['eip155:5042', 'eip155:8453']) });
}
await check('A2A unsigned authorization', BRIDGE + '/a2a', { method: 'POST', body: a2a('bridge_authorization', intent), validate: ({ json }) => assert.ok(json.result.parts[0].data.typedData) });
for (const method of ['tasks/get', 'tasks/cancel']) await check(`A2A access ${method}`, BRIDGE + '/a2a', { method: 'POST', body: rpc(method, { id: fakeJob }), status: 401, validate: rpcError(-32001) });
for (const operation of ['next', 'resume', 'arm', 'renew', 'transactions']) await check(`A2A continuation guard ${operation}`, BRIDGE + '/a2a', { method: 'POST', body: a2a('bridge_continue', { operation, ...(['arm', 'renew', 'transactions'].includes(operation) ? { stepId: fakeStep } : {}), ...(operation === 'transactions' ? { hash: `0x${'0'.repeat(64)}` } : {}) }, undefined, { taskId: fakeJob }), status: 401, validate: rpcError(-32001) });
await check('A2A rejects unsupported streaming', BRIDGE + '/a2a', { method: 'POST', body: rpc('message/stream', {}), validate: rpcError(-32004) });
await check('A2A rejects wrong protocol', BRIDGE + '/a2a', { method: 'POST', body: rpc('tasks/get', { id: fakeJob }), headers: { 'A2A-Version': '1.0' }, status: 400, validate: rpcError(-32600) });

const mcp = (name, body, extra = {}) => check('MCP ' + name, ARCUS + '/mcp', { method: 'POST', body, headers: mcpHeaders, ...extra });
await mcp('initialize', rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Argos-ReadOnly-Audit', version: '1' } }), { validate: ({ json }) => assert.equal(json.result.protocolVersion, '2025-06-18') });
await mcp('tools/list', rpc('tools/list', {}), { validate: ({ json }) => assert.equal(json.result.tools[0].name, 'lookup_ownerless_bridge') });
await mcp('resources/list', rpc('resources/list', {}), { validate: ({ json }) => assert.ok(json.result.resources.length) });
await mcp('resources/read', rpc('resources/read', { uri: ARCUS + '/llms.txt' }), { validate: ({ json }) => assert.ok(json.result.contents[0].text.includes('0.007')) });
await mcp('lookup payment challenge', rpc('tools/call', { name: 'lookup_ownerless_bridge', arguments: { token, chain: 'arc' } }), { validate: challenge('7000', ARCUS + '/v1/lookup', ['eip155:5042']) });
await mcp('invalid lookup parameters', rpc('tools/call', { name: 'lookup_ownerless_bridge', arguments: { token: 'invalid' } }), { validate: rpcError(-32602) });
await mcp('reject untrusted origin', rpc('tools/list', {}), { headers: { ...mcpHeaders, origin: 'https://example.invalid' }, status: 403, validate: rpcError(-32600) });
await mcp('reject unsupported protocol', rpc('tools/list', {}), { headers: { ...mcpHeaders, 'MCP-Protocol-Version': '2099-01-01' }, status: 400, validate: rpcError(-32600) });
await check('Arcus isolates bridge job routes', ARCUS + '/v1/jobs', { method: 'POST', body: {}, status: 404 });
console.log(`Finished: ${results.filter(r => r.pass).length}/${results.length} passed. JSON report: ${out.pathname}`);
if (results.some(r => !r.pass)) process.exitCode = 1;
