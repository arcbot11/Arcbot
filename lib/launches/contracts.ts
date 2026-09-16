import { parseAbi, type Address } from "viem";
import { ARC_USDC } from "../arc/config";

export const PORTAL6 = "0xA5628A11c412596E1f63b75a2C0284F843C549d6" as const;
export const PORTAL7 = "0xB021Be536808f551b31789422Fd28a6c9c6e97Da" as const;
export const PORTAL6_CODE_HASH = "0xe0c3db1cba754430a88582b593b819e40484e778f9121ece798f74b4dcee5863" as const;
export const LAUNCH_PORTAL = PORTAL7;
export const LAUNCH_PORTAL_CODE_HASH = '0xe94d472a2fd09ea7abd17e6e6b76655eb4496b0f6525ccc7b466d01093537a26' as const;
export const LAUNCH_REGISTRY = '0xfA4552DD491acC08051725fe522F4cfEaeC8EDc6' as const;
export const LAUNCH_REWARD_CONFIG = '0x87FE2242b83680F3912829014A5915c9B0A51dD3' as const;
export const LAUNCH_DEFAULTS = { totalSupply: 10n ** 27n, startFdvUsdc6: 2_500_000_000n, bondFdvUsdc6: 45_000_000_000n, quoteAsset: ARC_USDC };
export const portalAbi = parseAbi([
  "struct LaunchParams { string name; string symbol; uint256 totalSupply; uint256 startFdvUsdc6; uint256 bondFdvUsdc6; uint16 buyTaxBps; uint16 sellTaxBps; uint16 creatorBps; uint16 burnBps; uint16 dividendBps; uint16 liquidityBps; uint256 devBuyQuote; address quoteAsset; uint8 expectConvert; }",
  "struct TokenMeta { string imageURI; string website; string twitter; string telegram; string description; }",
  "function launch(LaunchParams p, TokenMeta meta, bytes32 salt, bytes32 hookSalt) returns (address token)",
  "function LAUNCH_STRUCT_WORDS() view returns (uint256)",
  "function quoteApproved(address) view returns (bool)",
  "function tokenImpl() view returns (address)",
  "function splitterImpl() view returns (address)",
  "function lockerImpl() view returns (address)",
  "function registry() view returns (address)",
  "function payoutAssetFor(address quote) view returns (address)",
  "function predictSplitter(address creator, bytes32 salt) view returns (address)",
  "function hookInitCodeHash(address splitter, uint16 buyTaxBps, uint16 sellTaxBps, address quote) view returns (bytes32)",
  "function hookCreate2Salt(address creator, bytes32 hookSalt) pure returns (bytes32)",
  "function predictHook(address creator, bytes32 salt, bytes32 hookSalt, uint16 buyTaxBps, uint16 sellTaxBps, address quote) view returns (address hook, uint160 mask, bool valid)",
  "function predictToken(address creator, bytes32 salt, address hook, address quote) view returns (address)",
]);
export const configAbi = parseAbi([
  "function launchConfig() view returns (address)",
  "function configFor(address creator) view returns (uint8 mode, uint96 minimumShareBalance)",
  "function setConfig((uint8 mode, uint96 minimumShareBalance) cfg)",
]);
export const approvalAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const reviewedImplementations: Record<string, Address> = {
  tokenImpl: "0x1B74922c01DDfD9C77B37D02C0a236611E8Fe500",
  splitterImpl: "0xd9578dd861b2fe59675C2C4B09b026FcB0df37FC",
  lockerImpl: "0xb2eD8112Db1bc11F7e7AB7969C2a9d1f819Cfc6A",
};
