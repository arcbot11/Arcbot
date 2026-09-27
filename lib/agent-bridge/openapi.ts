import { ORIGIN, NAME, DESCRIPTION, config } from "./config";
import { openapi as lookupOpenapi } from "../bridge-api/discovery";
export const guidance = `Argos Bot CTS Bridge API
Independent external-wallet API for ownerless Arc (5042) and Base (8453) token connections through Circle CTS, CrossChainTokenService and CCTP.
1. GET /v1/lookup?token=0x...&chain=arc|base. Missing registration is a valid paid result. A token address alone cannot prove its chain.
2. POST /v1/authorization with a JobIntent. Sign its typedData with the external EOA that holds the tokens. Preserve the intent and expiresAt exactly.
3. POST /v1/jobs with intent, expiresAt, signature. The standard endpoint accepts Circle Gateway USDC on Arc or direct USDC on Base. Alternatively use POST /v1/jobs/direct for direct USDC on Arc or Base. Pay only an option offered by the current challenge; never switch endpoints or rails while a payment is unresolved. Retry the identical body with the same Payment-Signature. Preserve returned job.id and accessToken. Never replace an uncertain payment.
4. Use Authorization: Bearer accessToken for all job endpoints. POST /v1/jobs/{id}/next returns a quote. Check route, step, fees and chain. POST /arm with stepId immediately before signing. Only arm returns the signable transaction and its deadline.
5. Sign and broadcast that exact transaction with your own wallet. Do not sign expired plans. Persist the signed transaction/hash locally before broadcast. POST /transactions with stepId and hash. On timeout, recover the same wallet transaction; do not create another transfer.
6. POST /resume refreshes receipts; GET the job to read saved progress. After registration, approval or deployment is complete, call /next again. Repeat until job.state is complete. Delivered means observed on destination but not yet finalized. Waiting for finality can take roughly 20 minutes on Base and is not a failure.
7. To return tokens, create a NEW job using the wrapped address and its current source chain. Destination is always the same EOA on the other chain. Setup requires allowSetup=true; mode=setup creates a connection without transferring tokens. Existing approved setup is reused.
Standard lookup costs 0.005 USDC and a job costs 0.01 USDC. The /direct alternatives cost 0.007 and 0.012 USDC respectively. A job includes subsequent preparation, status and recovery requests. The payment network is independent of the token source chain. Network gas and Circle forwarding fees are separate and use source native units (18 decimals: Arc USDC or Base ETH). Fee caps are per transaction. Source tokens use their own decimals. Base ETH is needed for transactions originating on Base, including return/unwrap.
Only Arc/Base external EOAs are supported. Known incompatible tokens, wrong contract identities, pauses, failed simulations and insufficient gas are blocked. Wrapper creation does not certify transfer behavior or guarantee liquidity. This API never receives private keys, signs transactions or exposes operator wallets.
Armed or submitted steps are never automatically discarded. If a wallet request was interrupted, provide its hash. A finalized same-nonce replacement can terminate the job. Preserve recovery data; never assume a missing receipt means no transaction occurred.
If an armed quote expires before broadcast, POST /renew with stepId to obtain a fresh quote at the SAME nonce. First reconcile any transaction your wallet already broadcast. A quoted, unarmed step can be refreshed using /next. Neither endpoint broadcasts anything.
OpenAPI: ${ORIGIN}/openapi.json
For an uncertain direct USDC payment, retry the identical paid request with its original Payment-Signature and a Payment-Transaction header containing the settlement transaction hash from the facilitator. Recovery requires finalized canonical USDC receipt and exact authorization evidence. It never submits payment again. Missing evidence, unsupported batched calls or an unknown hash leave the payment unresolved; do not pay again. Gateway reconciliation does not need this header.
This service is independent of Circle. Marketplace listing requires separate review; this document is not an endorsement.
`;
export function openapi() {
  const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
  const address = {
    type: "string",
    pattern: "^0x[0-9a-fA-F]{40}$",
    description: "Nonzero EVM address",
  };
  const atomic = {
    type: "string",
    pattern: "^(0|[1-9][0-9]*)$",
    description:
      "Unsigned decimal integer in native atomic units (18 decimals), per transaction",
  };
  const content = (schema: unknown) => ({ "application/json": { schema } });
  const response = (description: string, schema: unknown) => ({
    description,
    content: content(schema),
  });
  const payment = (
    kind: "lookup" | "job",
    rail: "gateway" | "direct" = "gateway",
  ) => ({
    price: {
      mode: "fixed",
      currency: "USDC",
      amount: config(kind, rail).price,
    },
    protocols: [
      {
        x402: {
          networks: ["eip155:5042"],
          scheme: "exact",
          asset: "0x3600000000000000000000000000000000000000",
          rail: rail === "gateway" ? "circle-gateway" : "direct",
        },
      },
      {
        x402: {
          networks: ["eip155:8453"],
          scheme: "exact",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          rail: "direct",
        },
      },
    ],
  });
  const errors = {
    "400": response("Invalid input; not charged", ref("Error")),
    "401": response("Invalid job capability", ref("Error")),
    "409": response(
      "Unresolved payment/transaction or changed step. Reconcile before retrying.",
      ref("Error"),
    ),
    "429": response("Rate limited; observe Retry-After", ref("Error")),
    "503": response(
      "Dependency unavailable; preserve payment and transaction recovery data",
      ref("Error"),
    ),
  };
  const paidHeaders = [
    {
      name: "Payment-Transaction",
      in: "header",
      description:
        "Optional direct-payment settlement hash for read-only reconciliation of an uncertain payment. Requires the original Payment-Signature and identical request; never a bridge transaction hash.",
      schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
    },
    {
      name: "Payment-Signature",
      in: "header",
      description:
        "Private base64 x402 v2 authorization; preserve and reuse the same proof for recovery",
      schema: { type: "string" },
    },
  ];
  const body = (schema: unknown) => ({
    required: true,
    content: content(schema),
  });
  const jobOperation = (id: string, summary: string, input?: unknown) => ({
    operationId: id,
    summary,
    security: [{ JobAccess: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Job ID returned by the paid create call",
        schema: { type: "string", pattern: "^ab_[a-f0-9]{48}$" },
      },
    ],
    ...(input ? { requestBody: body(input) } : {}),
    responses: {
      "200": response(
        "Current job; only an armed step contains a signable transaction",
        ref("Job"),
      ),
      ...errors,
    },
  });
  const step = {
    type: "object",
    additionalProperties: false,
    required: ["stepId"],
    properties: {
      stepId: {
        type: "string",
        format: "uuid",
        description: "Exact step ID from the current quote",
      },
    },
  };
  const spec = {
    openapi: "3.1.0",
    info: {
      title: NAME,
      version: "1.0.0",
      description: DESCRIPTION,
      "x-guidance": guidance,
      contact: { name: "Argos Bot", url: "https://t.me/argosbotcommunity" },
    },
    servers: [{ url: ORIGIN }],
    externalDocs: { url: `${ORIGIN}/llms.txt` },
    paths: {
      "/v1/lookup": {
        get: {
          operationId: "lookupOwnerlessBridge",
          summary:
            "Find an ownerless Arc/Base bridge and identify original, wrapper, supply and contracts",
          "x-payment-info": payment("lookup"),
          parameters: [
            {
              name: "token",
              in: "query",
              required: true,
              description: "Token contract on the selected chain",
              schema: address,
            },
            {
              name: "chain",
              in: "query",
              description:
                "Supply explicitly when known; omission inspects both chains",
              schema: { type: "string", enum: ["arc", "base"] },
            },
            {
              name: "finality",
              in: "query",
              description: "Snapshot finality",
              schema: {
                type: "string",
                enum: ["latest", "finalized"],
                default: "latest",
              },
            },
            ...paidHeaders,
          ],
          responses: {
            "200": response(
              "Paid lookup, including missing registrations",
              ref("PaidLookup"),
            ),
            "402": response(
              "x402 USDC payment required",
              ref("PaymentRequired"),
            ),
            ...errors,
          },
        },
      },
      "/v1/authorization": {
        post: {
          operationId: "authorizeBridgeJob",
          summary:
            "Get wallet typed data for a fixed job intent; no funds move",
          requestBody: body(ref("JobIntent")),
          responses: {
            "200": response(
              "Sign typedData; send intent, expiresAt and signature to createJob",
              {
                type: "object",
                required: ["intent", "expiresAt", "typedData"],
                properties: {
                  intent: ref("JobIntent"),
                  expiresAt: { type: "integer" },
                  typedData: ref("JobAuthorization"),
                  apiFeeUSDC: { type: "string" },
                  purpose: { type: "string" },
                },
              },
            ),
            ...errors,
          },
        },
      },
      "/v1/jobs": {
        post: {
          operationId: "createBridgeJob",
          summary:
            "Purchase one resumable setup or bridge job; wallet signatures remain external",
          "x-payment-info": payment("job"),
          parameters: paidHeaders,
          requestBody: body(ref("CreateJob")),
          responses: {
            "200": response("Paid job with private access token", {
              type: "object",
              required: ["requestId", "result", "payment"],
              properties: {
                requestId: { type: "string" },
                result: {
                  type: "object",
                  required: ["job", "accessToken"],
                  properties: {
                    job: ref("Job"),
                    accessToken: {
                      type: "string",
                      description:
                        "Secret Bearer capability. Store securely; do not include in URLs.",
                    },
                  },
                },
                payment: ref("Receipt"),
                recovered: { type: "boolean" },
              },
            }),
            "402": response(
              "x402 USDC payment required; retain identical body during retry",
              ref("PaymentRequired"),
            ),
            ...errors,
          },
        },
      },
      "/v1/jobs/{id}": {
        get: jobOperation(
          "getBridgeJob",
          "Read saved job history without further payment",
        ),
      },
      "/v1/jobs/{id}/next": {
        post: jobOperation(
          "prepareBridgeStep",
          "Prepare registration, deployment, approval or transfer according to current state",
        ),
      },
      "/v1/jobs/{id}/arm": {
        post: jobOperation(
          "armBridgeStep",
          "Revalidate quote, reserve the wallet and return exact transaction to sign",
          step,
        ),
      },
      "/v1/jobs/{id}/renew": {
        post: jobOperation(
          "renewBridgeStep",
          "Renew an expired armed quote at the same nonce; reconcile any broadcast transaction first",
          step,
        ),
      },
      "/v1/jobs/{id}/transactions": {
        post: jobOperation(
          "recordBridgeTransaction",
          "Verify a broadcast transaction or finalized same-nonce replacement",
          {
            ...step,
            required: ["stepId", "hash"],
            properties: {
              ...step.properties,
              hash: {
                type: "string",
                pattern: "^0x[0-9a-fA-F]{64}$",
                description: "Transaction hash on the job's source chain",
              },
            },
          },
        ),
      },
      "/v1/jobs/{id}/resume": {
        post: jobOperation(
          "resumeBridgeJob",
          "Refresh finality and delivery; never rebroadcast or repeat a transfer",
        ),
      },
    },
    components: {
      securitySchemes: {
        JobAccess: {
          type: "http",
          scheme: "bearer",
          description:
            "Capability issued only for a paid job; independent of wallet signing",
        },
      },
      schemas: {
        ...lookupOpenapi().components.schemas,
        JobAuthorization: {
          type: "object",
          required: ["domain", "types", "primaryType", "message"],
          properties: {
            domain: {
              type: "object",
              required: ["name", "version", "chainId"],
              properties: {
                name: { type: "string", const: NAME },
                version: { type: "string", const: "1" },
                chainId: { type: "integer", enum: [5042, 8453] },
              },
            },
            primaryType: { type: "string", const: "BridgeJob" },
            types: {
              type: "object",
              properties: {
                BridgeJob: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["name", "type"],
                    properties: {
                      name: { type: "string" },
                      type: { type: "string" },
                    },
                  },
                },
              },
            },
            message: {
              type: "object",
              required: ["origin", "intentHash", "expiresAt"],
              properties: {
                origin: { type: "string", const: ORIGIN },
                intentHash: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
                expiresAt: { type: "string", pattern: "^[0-9]+$" },
              },
            },
          },
        },
        TokenIdentity: {
          type: "object",
          required: [
            "chainId",
            "chain",
            "address",
            "role",
            "isBridgedRepresentation",
          ],
          properties: {
            chainId: { type: "integer", enum: [5042, 8453] },
            chain: { type: "string", enum: ["Arc", "Base"] },
            address,
            role: { type: "string", enum: ["original", "wrapped"] },
            isBridgedRepresentation: { type: "boolean" },
          },
        },
        Quote: {
          type: "object",
          required: [
            "step",
            "chainId",
            "expiresAt",
            "nonce",
            "circleFeeAtomic",
            "gasBudgetAtomic",
            "nativeCurrency",
          ],
          properties: {
            step: {
              type: "string",
              enum: [
                "register",
                "deploy",
                "approve",
                "reset-approval",
                "transfer",
              ],
            },
            chainId: { type: "integer", enum: [5042, 8453] },
            expiresAt: { type: "integer" },
            to: address,
            nonce: { type: "integer" },
            circleFeeAtomic: atomic,
            gasBudgetAtomic: atomic,
            nativeCurrency: { type: "string", enum: ["USDC", "ETH"] },
          },
        },
        JobIntent: {
          type: "object",
          additionalProperties: false,
          required: [
            "clientRequestId",
            "chain",
            "token",
            "account",
            "mode",
            "amount",
            "allowSetup",
            "riskAcknowledged",
            "maxForwardingFeeAtomic",
            "maxGasBudgetAtomic",
          ],
          properties: {
            clientRequestId: {
              type: "string",
              format: "uuid",
              description:
                "Unique ID for this intended operation; retain it across payment retries",
            },
            chain: {
              type: "integer",
              enum: [5042, 8453],
              description:
                "Chain containing the input token and paying network gas",
            },
            token: address,
            account: {
              ...address,
              description:
                "External EOA signer and destination recipient; must be an EOA on both chains",
            },
            mode: {
              type: "string",
              enum: ["setup", "transfer"],
              description: "Setup only or transfer after optional setup",
            },
            amount: {
              type: "string",
              description:
                "Exact decimal token amount; 0 for setup. Never use floating-point arithmetic.",
            },
            allowSetup: {
              type: "boolean",
              description:
                "Explicit authorization to register and deploy a missing ownerless connection",
            },
            riskAcknowledged: {
              type: "boolean",
              const: true,
              description:
                "Acknowledges original-token transfer risks; simulations are not certification",
            },
            maxForwardingFeeAtomic: atomic,
            maxGasBudgetAtomic: atomic,
          },
        },
        CreateJob: {
          type: "object",
          additionalProperties: false,
          required: ["intent", "expiresAt", "signature"],
          properties: {
            intent: ref("JobIntent"),
            expiresAt: {
              type: "integer",
              description:
                "Unmodified millisecond deadline from authorization endpoint",
            },
            signature: {
              type: "string",
              pattern: "^0x[0-9a-fA-F]{130}$",
              description: "EOA signature of returned EIP-712 typed data",
            },
          },
        },
        Job: {
          type: "object",
          required: ["id", "intent", "state", "steps", "revision", "message"],
          properties: {
            id: { type: "string" },
            intent: ref("JobIntent"),
            revision: { type: "integer" },
            state: {
              type: "string",
              enum: [
                "ready",
                "awaiting_signature",
                "awaiting_submission",
                "pending",
                "forwarding",
                "delivered",
                "complete",
                "failed",
              ],
            },
            message: { type: "string" },
            tokens: {
              type: "object",
              required: ["source", "destination", "original", "operation"],
              properties: {
                source: ref("TokenIdentity"),
                destination: {
                  anyOf: [ref("TokenIdentity"), { type: "null" }],
                },
                original: ref("TokenIdentity"),
                operation: {
                  type: "string",
                  enum: ["lock_and_mint", "burn_and_unlock"],
                },
              },
            },
            route: {
              type: "object",
              description:
                "Original chain, input token, counterpart and ownerless connection",
            },
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  state: { type: "string" },
                  hash: { type: "string" },
                  quote: ref("Quote"),
                  transaction: ref("Transaction"),
                  signBefore: {
                    type: "integer",
                    description:
                      "Never sign at or beyond this millisecond deadline",
                  },
                  observation: {
                    type: "object",
                    description:
                      "Receipt evidence, destination hash and finality state",
                  },
                },
              },
            },
          },
        },
        Transaction: {
          type: "object",
          required: [
            "chainId",
            "from",
            "to",
            "data",
            "value",
            "nonce",
            "gas",
            "maxFeePerGas",
            "maxPriorityFeePerGas",
          ],
          properties: {
            chainId: { type: "integer", enum: [5042, 8453] },
            from: address,
            to: address,
            data: { type: "string", pattern: "^0x[0-9a-fA-F]*$" },
            value: atomic,
            nonce: { type: "integer" },
            gas: atomic,
            maxFeePerGas: atomic,
            maxPriorityFeePerGas: atomic,
          },
        },
        PaidLookup: lookupOpenapi().components.schemas.LookupResponse,
        Receipt: {
          type: "object",
          description:
            "Gateway settlement acknowledgement; not necessarily an onchain transaction hash",
          properties: {
            success: { type: "boolean" },
            payer: address,
            transaction: { type: "string" },
            network: { type: "string" },
          },
        },
        PaymentRequired: {
          type: "object",
          required: ["x402Version", "accepts"],
          properties: {
            x402Version: { type: "integer", const: 2 },
            resource: { type: "object" },
            accepts: {
              type: "array",
              items: {
                type: "object",
                required: ["scheme", "network", "amount", "asset", "payTo"],
                properties: {
                  scheme: { type: "string" },
                  network: { type: "string" },
                  amount: { type: "string" },
                  asset: address,
                  payTo: address,
                  extra: { type: "object" },
                },
              },
            },
          },
        },
        Error: {
          type: "object",
          description:
            "Error details, possibly with a payment requestId requiring reconciliation",
        },
      },
    },
  };
  return {
    ...spec,
    paths: {
      ...spec.paths,
      "/v1/lookup/direct": {
        get: {
          ...spec.paths["/v1/lookup"].get,
          operationId: "lookupOwnerlessBridgeDirect",
          "x-payment-info": payment("lookup", "direct"),
        },
      },
      "/v1/jobs/direct": {
        post: {
          ...spec.paths["/v1/jobs"].post,
          operationId: "createBridgeJobDirect",
          "x-payment-info": payment("job", "direct"),
        },
      },
    },
  };
}
