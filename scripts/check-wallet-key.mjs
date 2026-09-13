// Offline only: private key arrives over stdin, never in arguments or files.
import { privateKeyToAddress } from 'viem/accounts';

const expected = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(expected ?? '')) {
  console.log('CHECK: Invalid expected wallet address.');
  process.exit(2);
}
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk.toString('utf8');
    if (input.length > 256) throw new Error('Invalid input');
  }
  const hex = input.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Invalid key');
  const address = privateKeyToAddress(`0x${hex}`);
  const matches = address.toLowerCase() === expected.toLowerCase();
  console.log(`CHECK: Derived address: ${address}`);
  console.log(`CHECK: ${matches ? 'MATCH - the key belongs to this wallet.' : 'NO MATCH - the key belongs to a different wallet.'}`);
  process.exitCode = matches ? 0 : 1;
} catch {
  // Do not print exceptions or input: either could expose secret material.
  console.log('CHECK: Invalid private key. Enter 64 hexadecimal characters, with or without 0x.');
  process.exitCode = 2;
} finally {
  input = '';
}
