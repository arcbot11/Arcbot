import { ARC_BOT_X_URL } from "./project-config";
// Configure owned accounts before publishing; no inherited social identities.
export const brand = {
  name: "Arc Bot",
  launchpad: "Argus",
  xUrl: ARC_BOT_X_URL,
  telegramUrl: process.env.NEXT_PUBLIC_ARCBOT_TELEGRAM_URL || "",
};
