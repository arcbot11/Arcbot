// LegacyLaunchLaunchDeployer limits UTF-8 bytes, not JavaScript string length.
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;
export const LAUNCH_METADATA_BYTE_MESSAGE = "Use a shorter token name or ticker. Emoji and some characters take extra space. Post the launch request again.";
export function launchIdentityTooLong(name: string, symbol: string) {
  return utf8Bytes(name) > 64 || utf8Bytes(symbol) > 16;
}
