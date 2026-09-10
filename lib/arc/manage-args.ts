import { getAddress, isAddress } from "viem";

export function parseArcManageArgs(args: string[]) {
  const [mode, walletFlag, wallet, requestFlag, requestId] = args;
  if (args.length !== 5 || !["status", "cancel-unsigned"].includes(mode)
    || walletFlag !== "--wallet" || requestFlag !== "--request"
    || !isAddress(wallet, { strict: true }) || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new Error("Use status or cancel-unsigned with --wallet ADDRESS --request REQUEST_ID");
  }
  return { mode: mode as "status" | "cancel-unsigned", wallet: getAddress(wallet), requestId };
}
