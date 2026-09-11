/** Presentation only. Never change addresses in commands or transaction data. */
export function socialAddressLinks(text: string) {
  const explorer = /\bBase (?:withdrawal|ETH|network)\b/i.test(text)
    && !/\bArc (?:USDC|network)\b/i.test(text)
    ? "https://basescan.org" : "https://www.arcexplorer.org";
  // Preserve existing URLs, including wallet links and transaction hashes.
  return text.replace(/https?:\/\/[^\s<>]+|\b0x[0-9a-f]{40}\b/gi, value =>
    /^https?:\/\//i.test(value) ? value : `${explorer}/address/${value}`);
}
