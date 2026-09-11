import { balanceSnapshot, ethPrice } from "../otc/runtime";
import { ethUsdDisplay } from "../base/eth-usd-display";
import { arcTokenInfo } from "./token-info";
import { formatUnits, getAddress, isAddress } from "viem";
import { arcDisplayConfig } from "./wallet-balance";
import { checkArcRpc, createArcRpc } from "./rpc";
import { ARC_USDC } from "./config";
import { arcTokenBalances } from "./wallet-tokens";
import catalog from "./token-catalog.json";
import pinned from "./pinned-token-addresses.json";
import { displayAmount, displayUsdc } from "../amount-display";
import { balanceWithUsd } from "../balance-display";
import { tokenUsdEstimate } from "./token-value";

export async function arcSocialBalance(wallet: `0x${string}`, identifier?: string, knownTokens: string[] = []) {
  const name = identifier?.replace(/^\$/, "");
  if (name && name.toUpperCase() !== "USDC" && name.toLowerCase() !== ARC_USDC.toLowerCase()) {
    const matches = catalog.filter(t => t.symbol.toLowerCase() === name.toLowerCase());
    if (!isAddress(name) && matches.length !== 1) throw Error("Use the Arc token contract address in the balance command.");
    const address = getAddress(isAddress(name) ? name : matches[0].address);
    const balance = await arcTokenInfo(address, wallet);
    const amount = formatUnits(BigInt(balance.raw!), balance.decimals);
    const price = await tokenUsdEstimate(address, amount).catch(() => ({ usdValue: null }));
    return { display: balanceWithUsd(`${displayAmount(amount, 0)} ${balance.symbol}`, price.usdValue ?? undefined), symbol: balance.symbol, raw: balance.raw, decimals: balance.decimals };
  }
  const config = arcDisplayConfig(), rpc = createArcRpc(config), head = await checkArcRpc(rpc, config);
  const raw = await rpc.balance(wallet, head.number);
  if ((await rpc.block(head.number)).hash !== head.hash) throw Error("Arc balance block changed. Retry the balance command.");
  const usdcAmount = formatUnits(raw, 18);
  const usdc = `${displayUsdc(usdcAmount)} USDC`;
  if (name) return { display: usdc, symbol: "USDC", raw: raw.toString(), decimals: 18 };
  const [holdings, base] = await Promise.all([arcTokenBalances(wallet, [...new Set([...knownTokens, ...pinned])]), (async()=>{
    try {
      const snapshot=await balanceSnapshot(8453,wallet);
      if(BigInt(snapshot.balanceWei)===0n)return null;
      const rate=await ethPrice().catch(()=>null);
      const usd=ethUsdDisplay(snapshot.balanceWei,undefined,rate?.ethUsdMicros??null);
      return `${formatUnits(BigInt(snapshot.balanceWei),18)} Base ETH${usd?` (${usd})`:""}`;
    } catch { return "Base balance unavailable."; }
  })()]);
  return { display: [usdc, ...holdings.tokens.map(t => `${balanceWithUsd(`${displayAmount(t.balance, 0)} ${t.symbol}`, t.usdValue ?? undefined)}\nhttps://www.arcexplorer.org/token/${t.address}`), ...(base?[base]:[]), ...(holdings.partial ? ["Some token balances are unavailable. Check the balance using a contract address."] : [])].join("\n\n") };
}
