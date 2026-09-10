// Configure owned accounts before publishing; no inherited social identities.
export const brand = {
  name: "Arc Bot",
  launchpad: "Argus",
  xUrl: process.env.NEXT_PUBLIC_ARCBOT_X_URL || "",
  telegramUrl: process.env.NEXT_PUBLIC_ARCBOT_TELEGRAM_URL || "",
};
