import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

// Run with --apply after reviewing the default read-only output.
assert.equal(process.env.NEXT_PUBLIC_CONVEX_URL, "https://aware-okapi-12.convex.cloud");
assert.ok(process.env.CONVEX_DEPLOY_KEY, "Convex deployment key is required");
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);
const expected = [
  ["2097696306135220226", "0x96145386E08123F311EBe5c3548EBe706f0d85Dc"],
  ["2097782568934371330", "0x7d381D70e3Cc6532Fd5546e5439bC3D5CeCD28DC"],
];
const read = (xUserId) => client.query(makeFunctionReference("wallets:getXUserAndWallet"), { xUserId });
const before = [];
for (const [owner, address] of expected) {
  const { user, wallet } = await read(owner);
  assert.equal(user.walletId, wallet._id);
  assert.equal(wallet.ownerXUserId, owner);
  assert.equal(wallet.address.toLowerCase(), address.toLowerCase());
  assert.equal(wallet.signerWalletRef.toLowerCase(), address.toLowerCase());
  assert.ok([4663, 5042].includes(wallet.chainId));
  before.push(wallet);
  console.log(JSON.stringify({ address, chainId: wallet.chainId, targetChainId: 5042 }));
}
if (process.argv.includes("--apply")) {
  for (const wallet of before) {
    await client.mutation(makeFunctionReference("wallets:finishWalletProvisioning"), {
      xUserId: wallet.ownerXUserId, address: wallet.address, signerWalletRef: wallet.signerWalletRef,
    });
    const after = (await read(wallet.ownerXUserId)).wallet;
    assert.equal(after.chainId, 5042);
    assert.equal(after.launchEnabled, false);
    // Only these three metadata fields may change.
    const stable = ({ chainId, launchEnabled, updatedAt, ...rest }) => rest;
    assert.deepEqual(stable(after), stable(wallet));
    console.log(JSON.stringify({ address: after.address, chainId: after.chainId, verified: true }));
  }
}
