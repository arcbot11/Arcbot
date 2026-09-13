export const EXPORT_TTL_MS = 5 * 60_000;
export const EXPORT_APPROVAL_MS = 60_000;
export const EXPORT_LEASE_MS = 60_000;
export type ExportProvider = "x" | "telegram";
export function exportOrigin(value = process.env.WALLET_EXPORT_ORIGIN) {
  const url = new URL(value || "https://disabled.invalid");
  const main=process.env.NEXT_PUBLIC_SITE_URL?new URL(process.env.NEXT_PUBLIC_SITE_URL).origin:undefined;
  if (!value || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.origin===main || url.origin === "https://www.argosbot.io" || url.origin === "https://argosbot.io") throw Error("Key export is not configured.");
  return url.origin;
}
export const exportOwner = (provider: ExportProvider, userId: string) => {
  if (!/^\d{1,30}$/.test(userId)) throw Error("Invalid export identity.");
  return `${provider === "x" ? "x" : "tg"}:${userId}`;
};
export function exportDigest(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) throw Error("Invalid export request."); return value; }
export function exportAddress(value: string) { if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw Error("Invalid wallet binding."); return value.toLowerCase(); }
