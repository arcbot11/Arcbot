import {expect,it} from "vitest";
import {arcCommandResponse} from "../lib/public-links";
import {telegramResponse} from "../lib/telegram-commands";
import {xCommandReply,tokenClarificationReply} from "../lib/x-command-workflows";
const wallet="0x1111111111111111111111111111111111111111";
it.each(["Token UNKNOWN is not in the index. Enter its contract address.","More than one token uses SAME. Enter its contract address."])("keeps clarification free of wallet links on both channels: %s",message=>{
  const old=message+`\nYour wallet: https://www.argosbot.io/wallet/${wallet}`;
  expect(arcCommandResponse(message,wallet)).toBe(message);
  expect(telegramResponse(old)).not.toContain("Your wallet:");
  expect(xCommandReply(old,true)).not.toContain("Your wallet:");
  expect(tokenClarificationReply(arcCommandResponse(message,wallet))).not.toBeNull();
  expect(xCommandReply(old,true)).toContain("Reply with the contract address and tag @TheArgosBot.");
});
