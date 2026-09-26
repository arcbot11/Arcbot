import { apiConfig, LOOKUP_PATH } from "./config";
import { inputSchema, type LookupInput, type Report } from "./model";
import { lookupReport } from "./lookup";
import { apiStore, type ApiStore, type RequestRecord } from "./store";
import { encode, hash, parsePayment, paymentGateway, reconcileGateway, type PaymentGateway } from "./payments";
export function json(body: unknown, status = 200, headers: Record<string,string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Payment-Signature", "X-Content-Type-Options": "nosniff", ...headers } });
}
function recovered(row: RequestRecord) {
  if (row.state === "settled" && row.resultJson && row.receiptJson) return json({ requestId: row.requestId, result: JSON.parse(row.resultJson), payment: JSON.parse(row.receiptJson), recovered: true }, 200, { "PAYMENT-RESPONSE": encode(JSON.parse(row.receiptJson)) });
  return json({ requestId: row.requestId, state: row.state, error: row.state === "not_charged" ? "This attempt was not charged. Retry with a new authorization." : "Payment attempt is pending or requires reconciliation. Do not create a new payment for this request; retry the same signed request." }, 409);
}
export async function handleLookup(req: Request, deps: { config?: ReturnType<typeof apiConfig>; store?: ApiStore; gateway?: PaymentGateway; lookup?: (input: LookupInput, store: ApiStore) => Promise<Report>; reconcile?: typeof reconcileGateway } = {}) {
  let input: LookupInput;
  const url = new URL(req.url);
  try {
    if ([...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1)) return json({ error: "Duplicate parameters" }, 400);
    input = inputSchema.parse(Object.fromEntries(url.searchParams));
  } catch { return json({ error: "Use token=0x… and optional chain=arc|base, finality=latest|finalized." }, 400); }
  try {
    const header = req.headers.get("payment-signature");
    // Purchase configuration must not gate recovery of an existing payment.
    // Unpaid requests can still fail fast without requiring persistence.
    if (!header && !(deps.config || apiConfig()).enabled) return json({ error: "Paid bridge lookup is not enabled yet." }, 503);
    const store = deps.store || apiStore();
    // Hosting proxy must overwrite this header; absent headers share a conservative bucket.
    const ip = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!await store.limit(hash(ip))) return json({ error: "Rate limit reached" }, 429, { "Retry-After": "60" });
    const inputKey = hash(JSON.stringify(input));
    let payment: ReturnType<typeof parsePayment> | undefined;
    if (header) {
      try { payment = parsePayment(header); } catch { return json({ error: "Invalid or unsupported x402 payment payload" }, 400); }
      const previous = await store.recover(payment.requestId, payment.recoveryHash);
      if (previous) {
        if (previous.inputKey !== inputKey) return json({ error: "Payment is bound to a different lookup" }, 409);
        if (["settling", "uncertain"].includes(previous.state)) {
          const receipt = await (deps.reconcile || reconcileGateway)(payment.payload).catch(() => null);
          if (receipt) {
            await store.update(payment.requestId, "settled", undefined, JSON.stringify(receipt));
            const resolved = await store.recover(payment.requestId, payment.recoveryHash);
            if (resolved) return recovered(resolved);
          }
        }
        return recovered(previous);
      }
    }
    const config = deps.config || apiConfig();
    if (!config.enabled) return json({ error: "Paid bridge lookup is not enabled yet." }, 503);
    const gateway = deps.gateway || await paymentGateway(config);
    const resourceUrl = `${config.origin}${LOOKUP_PATH}?${url.searchParams.toString()}`;
    if (!payment) { const challenge = await gateway.challenge(resourceUrl); return json(challenge, 402, { "PAYMENT-REQUIRED": encode(challenge) }); }
    const requirements = await gateway.verify(payment.payload);
    if (!requirements) {
      const challenge = await gateway.challenge(resourceUrl);
      return json(challenge, 402, { "PAYMENT-REQUIRED": encode(challenge) });
    }
    const claim = await store.claim({ paymentKey: payment.paymentKey, recoveryHash: payment.recoveryHash, requestId: payment.requestId, inputKey });
    if (claim.kind !== "claimed") return claim.kind === "existing" && claim.request ? recovered(claim.request) : json({ error: "Payment already associated with another request or expired" }, 409);
    let result: Report;
    try {
      result = await (deps.lookup || lookupReport)(input, store);
      if (result.status === "unavailable") throw Error("Unavailable lookup");
      await store.update(payment.requestId, "prepared", JSON.stringify(result));
    } catch {
      await store.update(payment.requestId, "not_charged");
      await gateway.cancel(payment.payload, requirements);
      return json({ requestId: payment.requestId, error: "Lookup unavailable; payment was not submitted for settlement." }, 503);
    }
    // Persist intent before the irreversible boundary. Never automatically resubmit uncertain settlements.
    await store.update(payment.requestId, "settling");
    try {
      const receipt = await gateway.settle(payment.payload, requirements);
      if (!receipt.success) { await store.update(payment.requestId, "uncertain", undefined, JSON.stringify(receipt)); return json({ requestId: payment.requestId, error: "Settlement unresolved; do not pay again. Retry the same request for its status." }, 503); }
      await store.update(payment.requestId, "settled", undefined, JSON.stringify(receipt));
      return json({ requestId: payment.requestId, result, payment: receipt }, 200, { "PAYMENT-RESPONSE": encode(receipt) });
    } catch {
      // If recording itself is unavailable, the durable state remains settling.
      await store.update(payment.requestId, "uncertain").catch(() => {});
      return json({ requestId: payment.requestId, error: "Settlement needs reconciliation. Do not create a second payment." }, 503);
    }
  } catch { return json({ error: "Bridge API dependency unavailable. Retry later; retain any existing payment authorization for recovery." }, 503); }
}
