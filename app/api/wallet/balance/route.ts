import { NextRequest } from "next/server";
import { arcWalletBalance } from "@/lib/arc/wallet-balance";
import { balanceSnapshot } from "@/lib/otc/runtime";
import { websiteSession, json, webFailure } from "@/lib/otc/http";
import { repository } from "@/lib/otc/repository";
import { locked, walletId, type Wallet } from "@/lib/otc/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await websiteSession(request);
    const chain=request.nextUrl.searchParams.get("chain")==="8453"?8453:5042;
    const snapshot = chain===8453?await balanceSnapshot(8453,session.walletAddress):await arcWalletBalance(session.walletAddress);
    const wallet = await repository().read<Wallet | null>({ id: walletId(chain, session.walletAddress) });
    const balance = BigInt(snapshot.balanceWei), held = wallet ? locked(wallet) : 0n;
    return json({ walletAddress: session.walletAddress, availableWei: (balance > held ? balance - held : 0n).toString() });
  } catch (error) { return webFailure(error); }
}
