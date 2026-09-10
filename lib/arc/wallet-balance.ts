import { getAddress } from "viem";
import { arcConfig } from "./config";
import { createArcRpc, checkArcRpc } from "./rpc";

/** Display-only defaults. Sending still requires the explicit transaction configuration. */
export function arcDisplayConfig() {
  return arcConfig({
    rpcUrl: process.env.ARC_MAINNET_RPC_URL || "https://rpc.arc-scan.org",
    rpcFallbackUrls: process.env.ARC_INFURA_RPC_URL ? [process.env.ARC_INFURA_RPC_URL] : [],
    readOnlyRpcUrls: ["https://arguspad.io/api/rpc"],
    checkpointNumber: process.env.ARC_CHECKPOINT_NUMBER || "18456078",
    checkpointHash: process.env.ARC_CHECKPOINT_HASH || "0xdd5a48032af8571d6a262f39e5cde7e6b91625aaa4330289f03e5a346dd3c358",
  });
}
export async function arcWalletBalance(address: string) {
  const config=arcDisplayConfig();
  const rpc = createArcRpc(config), head = await checkArcRpc(rpc, config);
  const balance = await rpc.balance(getAddress(address), head.number);
  if ((await rpc.block(head.number)).hash !== head.hash) throw new Error("Balance block changed");
  return { balanceWei: balance.toString(), block: head.number.toString() };
}
