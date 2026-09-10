export function personalWalletError(error, stage) {
  const messages = {
    configuration: "CDP credentials are missing from .env.local.",
    name: "Choose Personal1 through Personal8.",
    key: "Invalid private key. Enter a 32-byte hexadecimal EVM private key.",
    name_taken: "This CDP name belongs to another address. Nothing was replaced.",
    already_registered: "This address is already registered in CDP under another name. Nothing was renamed.",
    address_mismatch: "CDP returned an unexpected address. Stop and check the account.",
  };
  if (Object.hasOwn(messages, error?.message)) return messages[error.message];
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 0;
  const hints = {
    400: "CDP rejected the request. Check the API credentials and wallet secret configuration.",
    401: "CDP authentication failed. Check the API key, API secret, and wallet secret for this CDP project.",
    403: "CDP denied access. Check API key permissions and any IP restrictions.",
    404: "CDP could not find the requested account or resource.",
    409: "CDP reported a conflict. Retry with the same wallet and name.",
    429: "CDP rate limit reached. Wait, then retry with the same wallet and name.",
  };
  const codes = new Set(["network_timeout", "network_connection_failed", "network_ip_blocked", "network_dns_failure", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_MODULE_NOT_FOUND"]);
  const code = [error?.errorType, error?.code, error?.cause?.code].find(value => codes.has(value));
  // Only fixed text, numeric HTTP status and allowlisted codes leave this boundary.
  const detail = hints[status] ?? (status >= 500 && status <= 599 ? "CDP service failed. Retry later with the same wallet and name." : "Check CDP access, configuration, and network connectivity. Retry with the same wallet and name.");
  return `${stage} failed${status >= 100 && status <= 599 ? ` (HTTP ${status})` : ""}${code ? ` [${code}]` : ""}. ${detail}`;
}
