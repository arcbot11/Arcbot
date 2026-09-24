import { launchPairFromXText } from "./x-pair";
import type { WalletCommand } from "../../convex/walletCommands";
import { launchAllocationFromXText } from "./x-allocation";
import { parseLaunchInput } from "./input";
import { LaunchError } from "./policy";
import { launchFeeRecipientFromXText, withoutLaunchFeeAssignment } from "./x-fee-recipient";

/** Converts already-grounded X launch metadata to the shared draft/encoding schema.
 * This function grants no execution authority and never signs or submits a launch. */
export function launchInputFromXCommand(command: Extract<WalletCommand, { kind: "launch" }>, text: string, imageURI: string) {
  const operative=text.replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'/g,'');
  if(/\b(?:no|zero|without(?:\s+an?)?)\s+(?:dev(?:eloper)?|initial|opening)\s+buy\b/i.test(operative))
    throw new LaunchError('DEV_BUY','Dev buy must be at least 4.50 USDC.');
  const recipient = launchFeeRecipientFromXText(text);
  if(recipient && (!command.feeDestination || command.feeDestination.recipient.toLowerCase()!==recipient.toLowerCase()))
    throw new LaunchError('FEE_RECIPIENT','Fee recipient has not been resolved. No launch was submitted.');
  if(!recipient && command.feeDestination)throw new LaunchError('FEE_RECIPIENT','Fee recipient differs from the launch post.');
  const pairToken = launchPairFromXText(text);
  if (command.devBuy && command.devBuy.unit !== "usd" && !(command.devBuy.unit === "pair" && command.pairToken?.toUpperCase() === "USDC"))
    throw new LaunchError("DEV_BUY", "Specify the developer buy in USDC or dollars.");
  return parseLaunchInput({ pairToken, name: command.name, symbol: command.symbol, imageURI,
    description: command.description, website: command.website, twitter: command.twitter, telegram: command.telegram,
    devBuyUSDC: command.devBuy?.amount, ...(command.feeDestination?{feeDestination:command.feeDestination}:{}), ...launchAllocationFromXText(withoutLaunchFeeAssignment(text)) });
}
