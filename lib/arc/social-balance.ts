import { arcTokenInfo } from "./token-info";
import { formatUnits, getAddress, isAddress } from "viem";
import { arcDisplayConfig } from "./wallet-balance";
import { checkArcRpc, createArcRpc } from "./rpc";
import { ARC_USDC } from "./config";
import { arcTokenBalances } from "./wallet-tokens";
import catalog from "./token-catalog.json";

export async function arcSocialBalance(wallet: `0x${string}`, identifier?: string) {
  const name = identifier?.replace(/^\$/, "");
  if (name && name.toUpperCase() !== "USDC" && name.toLowerCase() !== ARC_USDC.toLowerCase()) {
    const matches = catalog.filter(t => t.symbol.toLowerCase() === name.toLowerCase());
    if (!isAddress(name) && matches.length !== 1) throw Error("Use the Arc token contract address in the balance command.");
    const address = getAddress(isAddress(name) ? name : matches[0].address);
    const balance = await arcTokenInfo(address, wallet);
    return { display: balance.display!, symbol: balance.symbol, raw: balance.raw, decimals: balance.decimals };
  }
  const config = arcDisplayConfig(), rpc = createArcRpc(config), head = await checkArcRpc(rpc, config);
  const raw = await rpc.balance(wallet, head.number);
  if ((await rpc.block(head.number)).hash !== head.hash) throw Error("Arc balance block changed. Retry the balance command.");
  const usdc = `${formatUnits(raw, 18)} USDC`;
  if (name) return { display: usdc, symbol: "USDC", raw: raw.toString(), decimals: 18 };
  const holdings = await arcTokenBalances(wallet);
  return { display: [usdc, ...holdings.tokens.map(t => `${t.balance} ${t.symbol}\n${t.address}`), ...(holdings.partial ? ["Some token balances are unavailable. Check the balance using a contract address."] : [])].join("\n\n") };
}
