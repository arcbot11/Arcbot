import { same, type Prepared, type Route } from "./contracts";
import type { BridgeEntry } from "./validation";

export function canAdvanceBridge(entry: BridgeEntry | undefined, form: {
  route?: Route; account?: string; amount: string; mode: "connected" | "bot";
  network?: number; riskAcknowledged: boolean;
}) {
  const p = entry?.prepared, r = form.route;
  return Boolean(entry?.state === "complete" && !entry.supersededBy && p && p.step !== "transfer" &&
    r && form.account && same(form.account, p.intent.account) &&
    Boolean(entry.botId) === (form.mode === "bot") &&
    r.source === p.intent.chain && same(r.token, p.intent.token) &&
    form.amount === p.intent.amount && (p.intent.action !== "transfer" || form.riskAcknowledged) &&
    (form.mode !== "connected" || form.network === r.source));
}

export function bridgeStepCopy(step: Prepared["step"], symbol: string, destination: string) {
  switch (step) {
    case "reset-approval": return {
      title: "Reset token approval",
      button: `Reset ${symbol} approval`,
      description: "This token requires its existing allowance to be reset first. After confirmation, approve the new amount, then bridge. Your tokens have not moved yet.",
    };
    case "approve": return {
      title: "Step 1 of 2 · Approve tokens",
      button: `Approve ${symbol}`,
      description: "Allow Circle’s token manager to use this amount. This does not bridge or move your tokens. After confirmation, this button changes to Bridge for your separate confirmation.",
    };
    case "transfer": return {
      title: "Ready to bridge",
      button: `Bridge ${symbol} to ${destination}`,
      description: `Approval is in place. This transaction sends your tokens to ${destination}. Confirm below, then follow the transfer status here until delivery is verified.`,
    };
    case "register": return {
      title: "Setup · Register token",
      button: "Register token",
      description: "Register the original token with Circle. Next, create its wrapper on the other chain. No tokens are bridged during setup.",
    };
    case "deploy": return {
      title: "Setup · Create wrapped token",
      button: `Create wrapper on ${destination}`,
      description: "Request the wrapped token on the destination chain. Once setup is confirmed, enter an amount to approve and bridge.",
    };
  }
}
