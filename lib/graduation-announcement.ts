export const GRADUATION_CHECK_LIMIT = 24;

export function graduationNextCheckAt(createdAt: number, now: number) {
  const age = Math.max(0, now - createdAt);
  return now + (age < 60 * 60_000
    ? 2 * 60_000
    : age < 24 * 60 * 60_000
      ? 10 * 60_000
      : 60 * 60_000);
}

export function graduationTokenPageUrl(address: string, siteUrl?: string) {
  void siteUrl;
  return `https://www.arcchainbot.io/guide?token=${encodeURIComponent(address)}`;
}

export function graduationAnnouncementText(symbol: string, tokenUrl: string) {
  const ticker = symbol.replace(/^\$/, "").toUpperCase();
  return `Graduated: $${ticker}.
Token page:
${tokenUrl}`;
}
