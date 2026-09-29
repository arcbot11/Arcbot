import { DESCRIPTION, NAME, ORIGIN } from "./config";
import { SERVICE_ICON_URL } from "../service-brand";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Marketplace crawlers read branding from the origin's HTML homepage. */
export function homepage() {
  const name = escapeHtml(NAME), description = escapeHtml(DESCRIPTION);
  const icon = escapeHtml(SERVICE_ICON_URL), origin = escapeHtml(ORIGIN);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${origin}/">
<link rel="icon" type="image/png" href="${icon}">
<link rel="shortcut icon" href="${icon}">
<link rel="apple-touch-icon" href="${icon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${name}">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${origin}/">
<meta property="og:image" content="${icon}">
<meta property="og:image:alt" content="Argos Bot dog logo">
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@TheArgosBot">
<meta name="twitter:title" content="${name}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${icon}">
<style>body{margin:0;background:#08101c;color:#edf3fb;font:17px/1.6 system-ui,sans-serif}main{max-width:760px;margin:8vh auto;padding:32px}img{border-radius:50%;width:96px;height:96px}h1{line-height:1.2;font-size:clamp(28px,5vw,42px)}p{color:#bfcddd}nav{display:flex;flex-wrap:wrap;gap:16px;margin-top:32px}a{color:#9bcaff;text-underline-offset:4px}small{display:block;margin-top:40px}</style>
</head><body><main>
<img src="${icon}" alt="Argos Bot dog logo" width="96" height="96">
<h1>${name}</h1><p>${description}</p>
<p>Inspect original and wrapped token addresses, bridged supply and ownerless connections. Coordinate wrapper setup and transfers through Circle’s CrossChainTokenService and Cross-Chain Transfer Protocol (CCTP).</p>
<nav aria-label="API resources"><a href="/llms.txt">Agent documentation</a><a href="/openapi.json">OpenAPI specification</a><a href="/.well-known/x402">x402 discovery</a><a href="https://www.argosbot.io/bridge">Open the bridge</a></nav>
<small><a href="https://x.com/TheArgosBot">Contact @TheArgosBot</a></small>
</main></body></html>`;
}
