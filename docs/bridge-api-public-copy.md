# Public copy preview — Argos Bot CTS Bridge Lookup

Update 2026-09-27: the earlier exact-copy snapshot below describes the original
Gateway-only release. Production now also offers a **live, tested
0.007 USDC direct option** at `/api/v1/bridge/lookup/direct`; Gateway stays
0.005 USDC. Discovery now includes paymentOptions with explicit enabled flags,
and only enabled routes are advertised for purchase. OpenAPI documents both
paths and their configuration status. CRA seller registration and the direct
purchase/replay test are complete. Marketplace submission remains outstanding.
See `bridge-api-deployment.md` for receipt evidence and the remaining step.

This is a review artifact, not a deployment or marketplace submission. Website/API wording is extracted from current source. CRA fields below are proposed submission material; CRA display and accepted fields have not been confirmed. The production origin is https://www.argosbot.io. Preview assumes payments enabled at 0.005 USDC; it does not enable payments.

## Proposed CRA listing and registration material

```json
{
  "name": "Argos Bot CTS Bridge Lookup",
  "description": "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.",
  "price": "0.005 USDC per completed lookup",
  "method": "GET",
  "exampleUrl": "https://www.argosbot.io/api/v1/bridge/lookup?token=0xece5ca8bf9220718e5727754026757512212cb3c&chain=arc",
  "documentation": "https://www.argosbot.io/developers/bridge-api",
  "paymentNetwork": "Arc",
  "paymentAsset": "USDC",
  "paymentRail": "Circle Gateway x402 batching",
  "officialReferences": [{"title":"Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)","url":"https://www.circle.com/cross-chain-transfer-protocol"},{"title":"Arc Docs: CrossChainTokenService contract addresses","url":"https://docs.arc.io/arc/references/contract-addresses"},{"title":"Circle Docs: Circle Gateway","url":"https://developers.circle.com/gateway"}],
  "sellerAddress": "0x60E4834783dA4D4D7ad1C81fc48221840192152C"
}
```

## Website page — exact article copy

Path: /developers/bridge-api

Browser/page metadata title: Argos Bot CTS Bridge Lookup

Metadata description: Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.

### Argos Bot CTS Bridge Lookup

Find ownerless token connections between Arc and Base through Circle’s Crosschain Token Standard (CTS) and CrossChainTokenService. Identify the original token, its wrapped counterpart, outstanding wrapped supply and the contracts connecting them.

Available for 0.005 USDC per lookup.

Disabled alternative: In preparation. Proposed price: 0.005 USDC per lookup. Paid access is not enabled.

#### Circle infrastructure, identified

The lookup inspects CrossChainTokenService registrations and the associated token managers for connections using Circle’s Cross-Chain Transfer Protocol (CCTP). It checks contract identities, token bindings, ownerless configuration and pause state against the deployments supported by Argos Bot.

Bridge lookup and API payment use separate infrastructure: CTS and CCTP provide the token connection being inspected; Circle Gateway handles the default x402 payment rail for this API. This lookup does not register tokens, create wrappers or execute bridge transfers.

#### Both directions, clearly identified

Submit an original token or its wrapper. Every token is labeled Arc or Base, original or wrapped. Arc originals can have Base wrappers; Base originals can have Arc wrappers. Returning a wrapper to its original chain is reported as burn and unlock.

GET /api/v1/bridge/lookup?token=0x…&chain=arc

Use chain=base for an address on Base, or omit chain to inspect both. Use finality=finalized for finalized snapshots instead of the latest observed blocks.

#### What you receive

Original and wrapped addresses, token roles, direction, setup and operational status, outstanding wrapped supply, CrossChainTokenService and token-manager addresses, explorer links, and block evidence. Existing pairs are remembered; cached observations are explicitly timestamped and expire after 30 seconds.

A missing registration is a valid result. Network failures are not reported as missing bridges. Verification confirms the contract connection; it does not certify the original token’s transfer behavior, liquidity or redemption safety.

#### Pay per request with x402

When enabled, an unpaid request returns HTTP 402 with payment requirements. An x402 client handles the authorization and retries. The default payment rail uses Circle Gateway with the @circle-fin/x402-batching SDK, accepting USDC on Arc. This service does not request token approvals, bridge funds or need your private key.

Keep the signed payment private. If the response is interrupted, retry the identical query with the same Payment-Signature to recover the result for 24 hours. A pending or uncertain payment must not be replaced automatically. Successful no-bridge results are charged; lookups that fail before settlement are not submitted for payment.

#### Official infrastructure references

- [Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)](https://www.circle.com/cross-chain-transfer-protocol)
- [Arc Docs: CrossChainTokenService contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Circle Docs: Circle Gateway](https://developers.circle.com/gateway)

Argos Bot is an independent project and is not affiliated with or endorsed by Arc or Circle. Official infrastructure references identify the underlying protocols; they do not imply endorsement of this service or any token.

OpenAPI specification | x402 discovery | Configuration status | Open the bridge

## Navigation and existing site chrome

New footer link: CTS Bridge API → /developers/bridge-api

Existing header: Argos Bot; Tokens; How to Launch; Swap; Bridge; Guide; X; TG Bot; TG Community; existing session-dependent wallet menu.

Existing footer: Argos Bot; Your gateway to Arc Chain.; Explore; Tokens; How to Launch; Toolkit; Wallet; Bridge; CTS Bridge API; Guide; X; TG Bot; TG Community; arctos111@proton.me

Existing footer disclaimer: Argos Bot is an independent project and is not affiliated with or endorsed by Arc or Circle.

## x402 discovery — complete enabled output

Path: /.well-known/x402

```json
{
  "name": "Argos Bot CTS Bridge Lookup",
  "description": "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.",
  "status": "enabled",
  "references": [
    {
      "title": "Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)",
      "url": "https://www.circle.com/cross-chain-transfer-protocol"
    },
    {
      "title": "Arc Docs: CrossChainTokenService contract addresses",
      "url": "https://docs.arc.io/arc/references/contract-addresses"
    },
    {
      "title": "Circle Docs: Circle Gateway",
      "url": "https://developers.circle.com/gateway"
    }
  ],
  "documentation": "/developers/bridge-api",
  "openapi": "/api/v1/bridge/openapi",
  "routes": [
    {
      "pattern": "GET /api/v1/bridge/lookup",
      "priceUsd": "0.005",
      "description": "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.",
      "inputSchema": {
        "type": "object",
        "required": [
          "token"
        ],
        "additionalProperties": false,
        "properties": {
          "token": {
            "type": "string",
            "pattern": "^0x[0-9a-fA-F]{40}$"
          },
          "chain": {
            "type": "string",
            "enum": [
              "arc",
              "base"
            ]
          },
          "finality": {
            "type": "string",
            "enum": [
              "latest",
              "finalized"
            ],
            "default": "latest"
          }
        }
      }
    }
  ]
}
```

## OpenAPI — complete output, including every description and schema

Path: /api/v1/bridge/openapi

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Argos Bot CTS Bridge Lookup",
    "version": "1.0.0",
    "description": "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both."
  },
  "servers": [
    {
      "url": "https://www.argosbot.io"
    }
  ],
  "externalDocs": {
    "description": "Official Arc contract references for Circle CrossChainTokenService and CCTP",
    "url": "https://docs.arc.io/arc/references/contract-addresses"
  },
  "x-official-references": [
    {
      "title": "Circle: Crosschain Token Standard (CTS) and Cross-Chain Transfer Protocol (CCTP)",
      "url": "https://www.circle.com/cross-chain-transfer-protocol"
    },
    {
      "title": "Arc Docs: CrossChainTokenService contract addresses",
      "url": "https://docs.arc.io/arc/references/contract-addresses"
    },
    {
      "title": "Circle Docs: Circle Gateway",
      "url": "https://developers.circle.com/gateway"
    }
  ],
  "paths": {
    "/api/v1/bridge/lookup": {
      "get": {
        "operationId": "lookupOwnerlessBridge",
        "summary": "Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.",
        "description": "Read-only. Latest snapshots may be cached for up to 30 seconds. Verification does not certify transfer behavior. Retry an interrupted paid call with the identical Payment-Signature and query to recover its result for 24 hours. Never automatically create a new payment after an uncertain settlement.",
        "parameters": [
          {
            "name": "token",
            "in": "query",
            "required": true,
            "description": "Original or wrapped ERC-20 contract address; replace the example with the token being researched.",
            "schema": {
              "type": "string",
              "pattern": "^0x[0-9a-fA-F]{40}$"
            },
            "example": "0xece5ca8bf9220718e5727754026757512212cb3c"
          },
          {
            "name": "chain",
            "in": "query",
            "description": "Chain containing the input address. Omit to inspect both; multiple candidates require explicit chain selection.",
            "schema": {
              "type": "string",
              "enum": [
                "arc",
                "base"
              ]
            }
          },
          {
            "name": "finality",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "latest",
                "finalized"
              ],
              "default": "latest"
            }
          },
          {
            "name": "Payment-Signature",
            "in": "header",
            "schema": {
              "type": "string"
            },
            "description": "Base64 x402 v2 payment payload, obtained by handling the 402 challenge. Keep private for response recovery."
          }
        ],
        "responses": {
          "200": {
            "description": "Successful lookup or recovered paid result. No-registration, incomplete-setup and verification-failed findings are valid lookup results.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LookupResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid input; not charged"
          },
          "402": {
            "description": "x402 payment required or invalid payment authorization"
          },
          "409": {
            "description": "Existing payment pending, conflicting, expired or not charged; inspect state before retrying"
          },
          "429": {
            "description": "Rate limit; Retry-After supplied"
          },
          "503": {
            "description": "Disabled or dependency unavailable. If a requestId is present, settlement may require reconciliation; do not create a second authorization."
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Token": {
        "type": "object",
        "required": [
          "address",
          "chainId",
          "chain",
          "role",
          "isBridgedRepresentation"
        ],
        "properties": {
          "address": {
            "type": "string"
          },
          "chainId": {
            "type": "integer",
            "enum": [
              5042,
              8453
            ]
          },
          "chain": {
            "type": "string",
            "enum": [
              "Arc",
              "Base"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "original",
              "wrapped"
            ]
          },
          "isBridgedRepresentation": {
            "type": "boolean"
          },
          "name": {
            "type": "string"
          },
          "symbol": {
            "type": "string"
          },
          "decimals": {
            "type": "integer"
          },
          "explorerUrl": {
            "type": "string"
          }
        }
      },
      "Candidate": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "not_a_contract",
              "not_registered",
              "wrapper_missing",
              "verified",
              "verification_failed",
              "unavailable"
            ]
          },
          "connectionExists": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "ownerlessVerified": {
            "type": [
              "boolean",
              "null"
            ]
          },
          "source": {
            "$ref": "#/components/schemas/Token"
          },
          "destination": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/Token"
              },
              {
                "type": "null"
              }
            ]
          },
          "original": {
            "$ref": "#/components/schemas/Token"
          },
          "wrapped": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/Token"
              },
              {
                "type": "null"
              }
            ]
          },
          "direction": {
            "type": "string"
          },
          "operation": {
            "enum": [
              "lock_and_mint",
              "burn_and_unlock"
            ]
          },
          "wrappedSupply": {
            "type": [
              "object",
              "null"
            ],
            "properties": {
              "raw": {
                "type": "string"
              },
              "formatted": {
                "type": "string"
              },
              "chainId": {
                "type": "integer"
              },
              "tokenAddress": {
                "type": "string"
              },
              "decimals": {
                "type": "integer"
              },
              "meaning": {
                "type": "string"
              }
            }
          },
          "evidence": {
            "type": "array",
            "items": {
              "type": "object"
            }
          },
          "contracts": {
            "type": "array",
            "items": {
              "type": "object"
            }
          },
          "operational": {
            "type": "object"
          },
          "error": {
            "type": "string"
          }
        }
      },
      "LookupResponse": {
        "type": "object",
        "required": [
          "requestId",
          "result",
          "payment"
        ],
        "properties": {
          "requestId": {
            "type": "string"
          },
          "payment": {
            "type": "object",
            "description": "Facilitator settlement acknowledgement; Gateway batching is not necessarily a final onchain transfer."
          },
          "result": {
            "type": "object",
            "properties": {
              "status": {
                "enum": [
                  "complete",
                  "ambiguous",
                  "unavailable"
                ]
              },
              "observedAt": {
                "type": "string",
                "format": "date-time"
              },
              "cached": {
                "type": "boolean"
              },
              "cacheAgeMs": {
                "type": "integer"
              },
              "candidates": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Candidate"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Payment challenge

Resource description: Look up ownerless Arc and Base token connections through Circle's Crosschain Token Standard (CTS) and CrossChainTokenService, using Cross-Chain Transfer Protocol (CCTP) infrastructure. Get original and wrapped token addresses, outstanding wrapped supply, token-manager addresses, contract verification and setup status. Set token to a contract address and chain to arc or base; omit chain to inspect both.

Resource URL is the actual lookup URL, including its query. MIME type: application/json. Network: eip155:5042. Amount: 5000 atomic USDC units. Pay-to: 0x60E4834783dA4D4D7ad1C81fc48221840192152C. The facilitator supplies runtime requirements (including Gateway validity/domain fields); these are not a fixed marketing paragraph.

## API status/error messages — exact wording

- This attempt was not charged. Retry with a new authorization.
- Payment attempt is pending or requires reconciliation. Do not create a new payment for this request; retry the same signed request.
- Duplicate parameters
- Use token=0x… and optional chain=arc|base, finality=latest|finalized.
- Paid bridge lookup is not enabled yet.
- Rate limit reached
- Invalid or unsupported x402 payment payload
- Payment is bound to a different lookup
- Payment already associated with another request or expired
- Lookup unavailable; payment was not submitted for settlement.
- Settlement unresolved; do not pay again. Retry the same request for its status.
- Settlement needs reconciliation. Do not create a second payment.
- Bridge API dependency unavailable. Retry later; retain any existing payment authorization for recovery.

## Lookup explanations — exact wording

- Contract identity, metadata or ownerless checks failed. No compatible connection is asserted.
- Unable to determine: chain reads or snapshot verification failed. Retry later.
- Verifies the Circle ownerless connection at the reported blocks, not original-token transfer safety, trading liquidity, or guaranteed redemption. Operational status is not a wallet-specific transfer simulation.
- Outstanding wrapped supply on Arc; excludes unminted inbound transfers and tokens already burned for return.
- Outstanding wrapped supply on Base; excludes unminted inbound transfers and tokens already burned for return.

## Configuration status — enabled example

```json
{
  "service": "argos-bridge-lookup",
  "enabled": true,
  "configured": true,
  "note": "Configuration status only; not a live RPC or payment settlement check."
}
```

Disabled output changes enabled to false and returns HTTP 503; configured reflects configuration. Configuration errors return only service, enabled:false and configured:false.

## Other publication boundaries

The discovery endpoint returns status:not_enabled and routes:[] while disabled. The sitemap adds /developers/bridge-api. No X post, Telegram announcement, new CRA-hosted long-form page, logo upload, ERC-8004 identity or custom MCP server is submitted by this implementation. Existing site navigation/account UI is reused; this sheet covers new project copy plus its shared chrome, not every pre-existing website screen. Token metadata, block evidence, amounts and receipts are live response data, not fixed copy.
