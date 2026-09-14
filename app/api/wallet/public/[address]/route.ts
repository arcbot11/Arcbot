import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { arcWalletBalance } from "@/lib/arc/wallet-balance";
import { arcTokenBalances } from "@/lib/arc/wallet-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Public chain balances only. Never read wallet sessions, orders, or signing data. */
export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  const walletAddress = getAddress(address);
  const [native, tokens] = await Promise.allSettled([arcWalletBalance(walletAddress), arcTokenBalances(walletAddress,[],new URL(_request.url).searchParams.get("refresh")==="1")]);
  return NextResponse.json({
    walletAddress,
    balanceWei: native.status === "fulfilled" ? native.value.balanceWei : null,
    tokens: tokens.status === "fulfilled" ? tokens.value.tokens : [],
    verifiedAddresses: tokens.status === "fulfilled" ? tokens.value.verifiedAddresses : [],
    partial: native.status === "rejected" || tokens.status === "rejected" || tokens.value.partial,
  }, { headers: { "Cache-Control": "no-store" } });
}
