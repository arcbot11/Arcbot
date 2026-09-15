import { launchPairFromXText } from "./x-pair";
import type { WalletCommand } from "../../convex/walletCommands";
import { launchAllocationFromXText } from "./x-allocation";
import { parseLaunchInput } from "./input";
import { LaunchError } from "./policy";

/** Converts already-grounded X launch metadata to the shared draft/encoding schema.
 * This function grants no execution authority and never signs or submits a launch. */
export function launchInputFromXCommand(command: Extract<WalletCommand, { kind: "launch" }>, text: string, imageURI: string) {
  const pairToken = launchPairFromXText(text);
  if (command.devBuy && command.devBuy.unit !== "usd" && !(command.devBuy.unit === "pair" && command.pairToken?.toUpperCase() === "USDC"))
    throw new LaunchError("DEV_BUY", "Specify the developer buy in USDC or dollars.");
  return parseLaunchInput({ pairToken, name: command.name, symbol: command.symbol, imageURI,
    description: command.description, website: command.website, twitter: command.twitter, telegram: command.telegram,
    devBuyUSDC: command.devBuy?.amount ?? "0", ...launchAllocationFromXText(text) });
}
