import { balanceSnapshot } from "../otc/runtime";
import { FEE_EXECUTOR } from "./policy";
export async function feeFunding() {
  const snapshot=await balanceSnapshot(5042,FEE_EXECUTOR);
  return snapshot.balanceWei;
}
