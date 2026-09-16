import { getAddress } from "viem";
import { arcConfigFromEnv } from "./config";
import { createArcRpc, checkArcRpc } from "./rpc";

/** Display-only defaults. Sending still requires the explicit transaction configuration. */
export function arcDisplayConfig() {
  return arcConfigFromEnv({
    ...process.env,
    ARC_MAINNET_RPC_URL: process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io",
    ARC_CHECKPOINT_NUMBER: process.env.ARC_CHECKPOINT_NUMBER || "21065497",
    ARC_CHECKPOINT_HASH: process.env.ARC_CHECKPOINT_HASH || "0xdba68d53cfd9677309247a79359fe7d01599447d69f84f69a958bc179a6cdf07",
  });
}
export async function arcWalletBalance(address: string) {
  const config=arcDisplayConfig();
  const rpc = createArcRpc(config), head = await checkArcRpc(rpc, config);
  const balance = await rpc.balance(getAddress(address), head.number);
  if ((await rpc.block(head.number)).hash !== head.hash) throw new Error("Balance block changed");
  return { balanceWei: balance.toString(), block: head.number.toString() };
}
