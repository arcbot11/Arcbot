import { type Address, type Hex, zeroAddress } from "viem";
import { OWNERLESS, SERVICE, same, type BridgeChain } from "./contracts";
// Reviewed Circle deployments, independently read on both mainnets 2026-09-24.
export const pins: Record<
  BridgeChain,
  Record<string, { address: Address; hash: Hex }>
> = {
  5042: {
    service: {
      address: SERVICE,
      hash: "0xa8614688484545f373f168e374e4c8a1a8b2c07f02979615ad3968198841a08a",
    },
    implementation: {
      address: "0xcef229c35cf3b6ba34690295399369412ab9b2b8",
      hash: "0xcb40c3d4374e841757290953201a02f051f1ed1cb1777a076bae47d307a21622",
    },
    tokenManagerImplementation: {
      address: "0xF52f86d578Dabb27768B3Df21e759C4Ea1918647",
      hash: "0x0c76c90c4f7054332e7f83258409ff5a90c1ad55e9e0a04a173cccd5d3fa8a41",
    },
    crossChainTokenImplementation: {
      address: "0xDc0518fa6940Ecc05dBe5988A93C5A6e43Fec52e",
      hash: "0xcc3600e5f0dd9d53730069395de3c076eb849e818023e981e5cdf8f4eb2645e2",
    },
    deploymentDelegate: {
      address: "0xD25EBEa31F01b81C80960fa6f6351E0AF9c21367",
      hash: "0xa387c34ffbc3734175f59dede4d275da1e7f04157445c5e9e3c1044006c37bd4",
    },
    transferDelegate: {
      address: "0xe98BC278d3CD5ceDc8Fbff511E807447fdE273fF",
      hash: "0xe451167128e4a67bf6f7f59217fe7bf489f22fd01e220356f424a55e175c4c42",
    },
  },
  8453: {
    service: {
      address: SERVICE,
      hash: "0xa8614688484545f373f168e374e4c8a1a8b2c07f02979615ad3968198841a08a",
    },
    implementation: {
      address: "0xcef229c35cf3b6ba34690295399369412ab9b2b8",
      hash: "0x6f77634984d71179400b63e256399a1bd990ca838dfa070b47dba543ecf75919",
    },
    tokenManagerImplementation: {
      address: "0xF52f86d578Dabb27768B3Df21e759C4Ea1918647",
      hash: "0x0c76c90c4f7054332e7f83258409ff5a90c1ad55e9e0a04a173cccd5d3fa8a41",
    },
    crossChainTokenImplementation: {
      address: "0xDc0518fa6940Ecc05dBe5988A93C5A6e43Fec52e",
      hash: "0xcc3600e5f0dd9d53730069395de3c076eb849e818023e981e5cdf8f4eb2645e2",
    },
    deploymentDelegate: {
      address: "0xD25EBEa31F01b81C80960fa6f6351E0AF9c21367",
      hash: "0x2311e247258fc03be386316fbf6583b0e7b0ebb97c2b508f9617bf03ec837e9a",
    },
    transferDelegate: {
      address: "0xe98BC278d3CD5ceDc8Fbff511E807447fdE273fF",
      hash: "0x89093529807e5b6fb9f7de5317f3f2f1917c1ef3f68e998bb36e19dfa88d778c",
    },
  },
};
export const MANAGER_PROXY_HASH: Hex =
  "0x77c8b525323b7f3f4980ee57e1a5871c977a9370e4afd004d484c13bdbc1ca8f";
export const WRAPPER_PROXY_HASH: Hex =
  "0x0d8d75955ab8fc42763623b4c903e9134bd22563eff209a9ccb1f2607f26aabc";
export function assertOwnerless(
  owner: string,
  pending: string,
  assigner: string,
) {
  if (
    !same(owner, OWNERLESS) ||
    !same(pending, zeroAddress) ||
    !same(assigner, SERVICE)
  )
    throw Error("This connection is not in the reviewed ownerless state.");
}
// Address + runtime code hash admission, not symbol-based. Additional original
// tokens require review of BOTH deposits and withdrawals (tax/rebase/proxy risks).
export const reviewedOriginals = [
  {
    chain: 5042,
    token: "0xece5ca8bf9220718e5727754026757512212cb3c",
    hash: "0x1c441713f28003aa577016c49c68cc192304045425b39614894f36e328425c0b",
  },
];
export function compatibleOriginal(
  chain: BridgeChain,
  token: string,
  hash: string,
  extra: string | undefined,
) {
  const rows = extra ? JSON.parse(extra) : [];
  if (!Array.isArray(rows) || rows.length > 200)
    throw Error("Invalid bridge compatibility configuration.");
  return [...reviewedOriginals, ...rows].some(
    (r) =>
      r &&
      r.chain === chain &&
      typeof r.token === "string" &&
      typeof r.hash === "string" &&
      same(r.token, token) &&
      same(r.hash, hash),
  );
}
