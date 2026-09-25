import {
  defineChain,
  encodeAbiParameters,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
export type BridgeChain = 5042 | 8453;
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});
export const chains = { 5042: arc, 8453: base };
export const domains = { 5042: 26, 8453: 6 } as const;
export const otherChain = (chain: BridgeChain): BridgeChain =>
  chain === 5042 ? 8453 : 5042;
export const SERVICE: Address = "0x431871229103b780868f8C6BB820cd16ECf942BC";
export const TRANSMITTER: Address =
  "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
export const OWNERLESS: Address = "0x173d00f7e8702d176628963FbD4E1Bcc18B29F94";
export const MANAGER_IMPL: Address =
  "0xF52f86d578Dabb27768B3Df21e759C4Ea1918647";
export const TOKEN_IMPL: Address = "0xDc0518fa6940Ecc05dBe5988A93C5A6e43Fec52e";
export const IMPL_SLOT: Hex =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// Pinned Circle implementation's ERC-7201 Data.trustedDomains mapping is
// the second field (namespace slot + 1). No address getter is exposed.
export function trustedDomainSlot(domain: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint32" }, { type: "uint256" }],
      [
        domain,
        0x86a0e84c7d929f61fb2e716e558792f9ee8d701914df21037b29796118dd8e01n,
      ],
    ),
  );
}
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export const explorer = (
  chain: BridgeChain,
  type: "tx" | "address",
  value: string,
) => `${chains[chain].blockExplorers.default.url}/${type}/${value}`;
export const abi = parseAbi([
  "function getOwnerlessTokenId(address) view returns(bytes32)",
  "function resolveTokenManager(bytes32) view returns(address)",
  "function registerOwnerlessToken(address) payable returns(bytes32)",
  "function deployRemoteOwnerlessToken(address,uint32,(bytes signedQuote,address refundAddress)) payable returns(bytes32)",
  "function crossChainTransfer(bytes32,uint256,uint32,bytes,bytes32,uint32,(bytes signedQuote,address refundAddress),bool,bytes) payable",
  "function tokenManagerImplementation() view returns(address)",
  "function crossChainTokenImplementation() view returns(address)",
  "function deploymentDelegate() view returns(address)",
  "function transferDelegate() view returns(address)",
  "function isTrustedDomain(uint32) view returns(bool)",
  "function isSystemPaused() view returns(bool)",
  "function messageTransmitter() view returns(address)",
  "function denylistProvider() view returns(address)",
  "function isDenylisted(address) view returns(bool)",
  "function token() view returns(address)",
  "function service() view returns(address)",
  "function tokenId() view returns(bytes32)",
  "function tokenManagerType() view returns(uint8)",
  "function implementation() view returns(address)",
  "function owner() view returns(address)",
  "function pendingAssignedOwner() view returns(address)",
  "function ownershipAssigner() view returns(address)",
  "function operator() view returns(address)",
  "function paused() view returns(bool)",
  "function maxTransferAmount() view returns(uint256)",
  "function validateTransfer(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function decimals() view returns(uint8)",
  "function name() view returns(string)",
  "function symbol() view returns(string)",
  "error TokenNotRegistered(bytes32 tokenId)",
  "event CrossChainTransfer(bytes32 indexed tokenId,address indexed sourceAddress,uint32 indexed destinationDomain,bytes destinationAddress,uint256 amount,bool autoExecuteHookData,bytes32 hookDataHash)",
  "event TransferDelivered(bytes32 indexed tokenId,address indexed transferRecipient,uint32 sourceDomain,uint256 amount,bytes32 hookDataHash)",
  "event CrossChainTokenDeployed(bytes32 indexed tokenId,address tokenAddress,string name,string symbol,uint8 decimals)",
  "event CrossChainTokenIdClaimed(bytes32 indexed tokenId,address indexed tokenAddress,address deployer,bytes32 salt)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event MessageReceived(address indexed caller,uint32 sourceDomain,bytes32 indexed nonce,bytes32 sender,uint32 indexed finalityThresholdExecuted,bytes messageBody)",
  "event MessageSent(bytes message)",
]);
export function ownerlessId(chain: BridgeChain, token: Address): Hex {
  const salt = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint32" }, { type: "address" }],
      [
        keccak256(toHex("circle-cctpx-ownerless-token-salt")),
        domains[chain],
        token,
      ],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "bytes32" }],
      [keccak256(toHex("circle-cctpx-cross-chain-token-id")), SERVICE, salt],
    ),
  );
}
export type Route = {
  source: BridgeChain;
  destination: BridgeChain;
  origin: BridgeChain;
  original: Address;
  token: Address;
  counterpart?: Address;
  tokenId: Hex;
  manager?: Address;
  destinationManager?: Address;
  name: string;
  symbol: string;
  decimals: number;
  state: "register" | "deploy" | "ready";
  compatible: boolean;
  reason?: string;
};
export type Intent = {
  chain: BridgeChain;
  token: Address;
  account: Address;
  action: "register" | "deploy" | "transfer";
  amount: string;
  riskAcknowledged?: boolean;
};
export type Prepared = {
  intent: Intent;
  route: Route;
  step: "register" | "deploy" | "approve" | "reset-approval" | "transfer";
  to: Address;
  data: Hex;
  value: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  gasBudget: string;
  circleFee: string;
  nonce: number;
  expiresAt: number;
  seal: string;
};
