/** Only owned site routes may be carried through X authorization. */
export function walletReturnPath(value: string | null | undefined) {
  if (value === "/otc") return value;
  if (value && /^\/wallet\/0x[0-9a-fA-F]{40}$/.test(value)) return value;
  return "/wallet";
}
