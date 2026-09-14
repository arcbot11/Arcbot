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
import { displayAmount, displayUsdc, displayEth } from "../amount-display";
import { balanceWithUsd } from "../balance-display";
import { tokenUsdEstimate } from "./token-value";
import { retryBalanceRead } from "./balance-retry";

export async function arcSocialBalance(wallet: `0x${string}`, identifier?: string, knownTokens: string[] = []) {
  const name = identifier?.replace(/^\$/, "");
  if (name && name.toUpperCase() !== "USDC" && name.toLowerCase() !== ARC_USDC.toLowerCase()) {
    const matches = catalog.filter(t => t.symbol.toLowerCase() === name.toLowerCase());
    if (!isAddress(name) && matches.length !== 1) throw Error("Use the Arc token contract address in the balance command.");
    const address = getAddress(isAddress(name) ? name : matches[0].address);
    const balance = await retryBalanceRead(()=>arcTokenInfo(address, wallet));
    const amount = formatUnits(BigInt(balance.raw!), balance.decimals);
    const price = await tokenUsdEstimate(address, amount).catch(() => ({ usdValue: null }));
    return { display: balanceWithUsd(`${displayAmount(amount, 0)} ${balance.symbol}`, price.usdValue ?? undefined), symbol: balance.symbol, raw: balance.raw, decimals: balance.decimals };
  }
  const native=()=>retryBalanceRead(async()=>{
    const config=arcDisplayConfig(),rpc=createArcRpc(config),head=await checkArcRpc(rpc,config);
    const raw=await rpc.balance(wallet,head.number);
    if((await rpc.block(head.number)).hash!==head.hash)throw Error("Arc balance block changed. Retry the balance command.");
    return {display:`${displayUsdc(formatUnits(raw,18))} USDC`,symbol:"USDC",raw:raw.toString(),decimals:18};
  });
  if(name)return native();
  const [usdc,holdings, base] = await Promise.all([native().catch(()=>({display:"USDC balance could not refresh."})),arcTokenBalances(wallet, [...new Set([...knownTokens, ...pinned])],true).catch(()=>({tokens:[],partial:true})), (async()=>{
    try {
      const snapshot=await balanceSnapshot(8453,wallet);
      if(BigInt(snapshot.balanceWei)===0n)return null;
      const rate=await ethPrice().catch(()=>null);
      const usd=ethUsdDisplay(snapshot.balanceWei,undefined,rate?.ethUsdMicros??null);
      return `${displayEth(formatUnits(BigInt(snapshot.balanceWei),18))} Base ETH${usd?` (${usd})`:""}`;
    } catch { return "Base balance unavailable."; }
  })()]);
  const knownFailed='balancePartial' in holdings?holdings.balancePartial:holdings.partial;
  return { display: [usdc.display, ...holdings.tokens.map(t => `${balanceWithUsd(`${displayAmount(t.balance, 0)} ${t.symbol}`, t.usdValue ?? undefined)}${t.stale?" (last loaded)":""}`), ...(base?[base]:[]), ...(knownFailed ? ["Some token balances could not refresh after retries. Try again or check a token by contract address."] : [])].join("\n\n") };
}
