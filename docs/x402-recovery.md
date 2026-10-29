# x402 browser access and payment recovery

Public lookup REST endpoints, standalone bridge-job endpoints and A2A support browser preflight and expose payment-required/payment-response/retry-after headers. Clients may send Payment-Signature, Payment-Transaction, Authorization and Content-Type. Authentication remains per-payment or per-job Bearer; public CORS does not grant a wallet or job capability. The internal worker endpoint does not use public CORS.

Keep the original signed payment and identical lookup arguments or job intent after an interrupted settlement. Do not create another payment while its outcome is unknown. Recovery uses read-only chain/Gateway evidence and never resubmits settlement.

For direct USDC payments on Arc or Base, an existing uncertain payment can be recovered with a `Payment-Transaction` header containing the facilitator's settlement hash. The server checks the exact authorization calldata, Transfer and AuthorizationUsed events in a successful canonical finalized receipt. If a failed facilitator response contains a signed transaction, only its locally derived hash is retained; raw RPC errors and signed envelopes are stripped from future failure records.

If a canonical finalized block is past the direct authorization deadline and USDC's authorizationState is still false at that same block, the existing attempt becomes `not_charged`. Only that proven state permits a fresh authorization. A missing receipt, local elapsed time, RPC error, consumed nonce or unfinalized block does not establish non-payment. The durable payment tombstone remains and late workers cannot settle that old attempt.

Arcus MCP uses the same purchase journal as Arcus REST. Supply the original payload in `params._meta["x402/payment"]`. If a settlement hash is known, supply it in `params._meta["x402/payment-transaction"]`; it is a receipt locator, not new authority to charge. The original arguments and payment proof must still match. MCP retains the underlying HTTP state in `result._meta["argos/http-status"]`; a JSON-RPC HTTP 200 envelope can contain an unsuccessful paid operation.

Gateway receipt IDs indicate accepted batched transfers. Their final confirmation is separate from delivery of the API result. Direct-payment expiry logic does not apply to Gateway authorizations, and unfinished Gateway transfers must never be repurchased.

The October 29 paid MCP failure was an upstream Arcus facilitator RPC broadcast rate limit. This release repairs the API's recovery behavior; it does not change Arcus's RPC provider or silently route Arcus purchases to another facilitator.
