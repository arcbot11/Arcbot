/** Public, bearer/proof-authenticated APIs do not use browser cookies. */
export function publicApiCors(response: Response, methods = "GET, POST, OPTIONS") {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type, Payment-Signature, Payment-Transaction, A2A-Version, X-A2A-Extensions");
  headers.set("Access-Control-Expose-Headers", "Payment-Required, Payment-Response, Retry-After");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export function publicApiPreflight(methods?: string) {
  return publicApiCors(new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }), methods);
}
