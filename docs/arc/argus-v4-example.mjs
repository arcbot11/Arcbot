#!/usr/bin/env node
/**
 * Argus v4: read a launch, price it, and detect bonding.
 *
 *   npm i viem                                  # the only dependency
 *   node argus-v4-example.mjs 0xA4824D1927ccC6B562a2d3BD5f7FBeC4ca045629
 *
 * Read-only. Every call here is eth_call or eth_getLogs; nothing signs and
 * nothing sends. Pair it with argus-v4.json, which carries the ABIs and the
 * addresses this file hardcodes for readability:
 *
 *   https://arguspad.io/argus-v4.json
 *
 * There are four things in here that are easy to get wrong, and each one fails
 * QUIETLY rather than throwing. They are numbered in the code.
 */

import {createPublicClient, http, encodeAbiParameters, keccak256, getAddress} from "viem";

const RPC = "https://rpc.arc-scan.org";
const PORTAL = "0xa36c443A797771Df82533B8B4A86F0AFfd970862";
const STATE_VIEW = "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const QUOTE = "0x3600000000000000000000000000000000000000"; // USDC, 6dp, also the gas token
const POOL_FEE = 10_000; // 1%
const TICK_SPACING = 200;

const client = createPublicClient({
  transport: http(RPC, {
    // (1) ARC REFUSES JSON-RPC BATCHES with `-32600 batch disabled for this
    //     project`, and viem batches by default. Without this every multi-read
    //     fails with "JSON is not a valid request object", which reads like a
    //     bug in your encoding rather than a server policy.
    batch: false,
  }),
  chain: {
    id: 5042,
    name: "Arc",
    // USDC is the gas token. There is no wrapped native and no separate fee
    // asset: the 18dp native balance and the 6dp ERC-20 view at 0x3600 are one
    // balance, exactly 1e12 apart.
    nativeCurrency: {name: "USD Coin", symbol: "USDC", decimals: 18},
    rpcUrls: {default: {http: [RPC]}},
  },
});

// ---------------------------------------------------------------- the ABIs --

const DISCRIMINATOR = [
  {type: "function", name: "LAUNCH_STRUCT_WORDS", inputs: [], outputs: [{type: "uint8"}], stateMutability: "view"},
];

/**
 * (2) THE TEN-WORD SHAPE, AND THE REASON TO ASK BEFORE DECODING.
 *
 * A NINE-output decode of this ten-word return SUCCEEDS. It does not throw, it
 * does not warn: it returns the first nine fields and drops `tickBond`, and
 * every bonding calculation downstream then runs against `undefined`. That bug
 * shipped to the Argus front end and rendered "Unavailable" over a live
 * milestone for a day.
 *
 * The older hooked Portal genuinely returns nine words, and the two LEGACY
 * Portals return TEN words of DIFFERENT TYPES in a different order, so a word
 * count alone does not identify the shape either. `LAUNCH_STRUCT_WORDS()` is
 * the only reliable discriminator, and it exists for exactly this.
 */
const LAUNCHES_10 = [
  {
    type: "function",
    name: "launches",
    inputs: [{type: "address"}],
    outputs: [
      {name: "creator", type: "address"},
      {name: "tickStart", type: "int24"},
      {name: "tokenIsToken0", type: "bool"},
      {name: "locker", type: "address"},
      {name: "hook", type: "address"},
      {name: "splitter", type: "address"},
      {name: "buyTaxBps", type: "uint16"},
      {name: "sellTaxBps", type: "uint16"},
      {name: "positionId", type: "uint256"},
      {name: "tickBond", type: "int24"},
    ],
    stateMutability: "view",
  },
];

const HOOK = [
  // (3) `bonded` IS NOT IN THE LAUNCH STRUCT. It lives on the hook, which is
  //     word 4 of the record you just read, so you already hold the address.
  {type: "function", name: "bonded", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
  {type: "function", name: "bondTick", inputs: [], outputs: [{type: "int24"}], stateMutability: "view"},
  {type: "function", name: "bondBound", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
  {type: "function", name: "poolId", inputs: [], outputs: [{type: "bytes32"}], stateMutability: "view"},
  {type: "function", name: "quoteIsToken0", inputs: [], outputs: [{type: "bool"}], stateMutability: "view"},
  {
    type: "function",
    name: "totalFeeBps",
    inputs: [],
    outputs: [{name: "onBuy", type: "uint256"}, {name: "onSell", type: "uint256"}],
    stateMutability: "view",
  },
];

const STATE = [
  {
    type: "function",
    name: "getSlot0",
    inputs: [{type: "bytes32"}],
    outputs: [
      {name: "sqrtPriceX96", type: "uint160"},
      {name: "tick", type: "int24"},
      {name: "protocolFee", type: "uint24"},
      {name: "lpFee", type: "uint24"},
    ],
    stateMutability: "view",
  },
];

const ERC20 = [
  {type: "function", name: "symbol", inputs: [], outputs: [{type: "string"}], stateMutability: "view"},
  {type: "function", name: "decimals", inputs: [], outputs: [{type: "uint8"}], stateMutability: "view"},
  {type: "function", name: "totalSupply", inputs: [], outputs: [{type: "uint256"}], stateMutability: "view"},
];

// ------------------------------------------------------------------ poolId --

/**
 * (4) A v4 POOL IS NOT A CONTRACT. There is no address, no `slot0()` and no
 *     per-pool log source: it is a bytes32 derived from the PoolKey, and all
 *     state lives in the PoolManager singleton.
 *
 *     THE HOOK IS PART OF THE KEY. Leaving it out produces a valid-looking id
 *     for a pool that was never created, and `getSlot0` on it returns zeros
 *     rather than reverting, so the mistake surfaces as a price of 0.
 *
 *     Currencies are in ADDRESS ORDER, which is not the same as
 *     (quote, token): roughly two Arc pools in five sort the other way.
 */
function poolIdFor({token, hook}) {
  const [currency0, currency1] =
    BigInt(QUOTE) < BigInt(token) ? [QUOTE, token] : [token, QUOTE];
  return keccak256(
    encodeAbiParameters(
      [{type: "address"}, {type: "address"}, {type: "uint24"}, {type: "int24"}, {type: "address"}],
      [getAddress(currency0), getAddress(currency1), POOL_FEE, TICK_SPACING, getAddress(hook)],
    ),
  );
}

/**
 * Price in USDC, from the tick.
 *
 * `1.0001 ** tick` is the price of currency0 in currency1. When the token is
 * currency1 that ratio is already quote-per-token; when it is currency0 it is
 * the reciprocal. The 10 ** (decimals - 6) factor is the decimal gap: tokens
 * are 18dp and the quote is 6dp, and getting it backwards is nine orders of
 * magnitude, which looks like a plausible price rather than like an error.
 *
 * ILLUSTRATIVE, AND FLOAT. `Math.pow` is fine for showing a price on a
 * launch-sized token and is not what to ship: a market cap in 6dp units passes
 * 2^53 at about $9bn, past which Number silently loses the ordering you would
 * sort a board by. In production derive from `sqrtPriceX96` with bigint
 * arithmetic and keep the result as a scaled integer.
 */
function priceUsdc({tick, tokenIsToken0, tokenDecimals}) {
  const raw = Math.pow(1.0001, tokenIsToken0 ? tick : -tick);
  return raw * Math.pow(10, tokenDecimals - 6);
}

// -------------------------------------------------------------------- main --

const token = getAddress(process.argv[2] ?? "0xA4824D1927ccC6B562a2d3BD5f7FBeC4ca045629");

// STEP 1. Ask the discriminator BEFORE decoding anything.
let words;
try {
  words = await client.readContract({address: PORTAL, abi: DISCRIMINATOR, functionName: "LAUNCH_STRUCT_WORDS"});
} catch {
  // On Arc a missing selector answers 0x rather than a revert string, so this
  // catch is "not the current line", not "the node is broken".
  console.error("This Portal has no LAUNCH_STRUCT_WORDS(); it is an older line. Use its own shape.");
  process.exit(1);
}
if (words !== 10) {
  console.error(`Portal reports a ${words}-word launch record; this script decodes 10.`);
  process.exit(1);
}

// STEP 2. Now the decode is safe.
const L = await client.readContract({address: PORTAL, abi: LAUNCHES_10, functionName: "launches", args: [token]});
const [creator, tickStart, tokenIsToken0, locker, hook, splitter, buyTaxBps, sellTaxBps, positionId, tickBond] = L;

if (creator === "0x0000000000000000000000000000000000000000") {
  console.error(`${token} was not launched by this Portal. Ask the other three before concluding it is not ours.`);
  process.exit(1);
}

// STEP 3. Bonding state comes from the HOOK, not from the record.
const [symbol, decimals, supply, isBonded, hookBondTick, bondBound, fees] = await Promise.all([
  client.readContract({address: token, abi: ERC20, functionName: "symbol"}),
  client.readContract({address: token, abi: ERC20, functionName: "decimals"}),
  client.readContract({address: token, abi: ERC20, functionName: "totalSupply"}),
  client.readContract({address: hook, abi: HOOK, functionName: "bonded"}),
  client.readContract({address: hook, abi: HOOK, functionName: "bondTick"}),
  client.readContract({address: hook, abi: HOOK, functionName: "bondBound"}),
  client.readContract({address: hook, abi: HOOK, functionName: "totalFeeBps"}),
]);

// STEP 4. Price, via StateView, by pool id.
const poolId = poolIdFor({token, hook});
const onChainPoolId = await client.readContract({address: hook, abi: HOOK, functionName: "poolId"});
const [sqrtPriceX96, tick] = await client.readContract({
  address: STATE_VIEW,
  abi: STATE,
  functionName: "getSlot0",
  args: [poolId],
});

const price = priceUsdc({tick, tokenIsToken0, tokenDecimals: decimals});
const fdv = price * Number(supply / 10n ** BigInt(decimals));

/**
 * Progress toward the milestone. DIRECTION DEPENDS ON ORDERING: when the token
 * is currency1 a rising valuation is a FALLING tick. Hardcoding one direction
 * bonds three fifths of launches at block one and the rest never.
 */
const span = Number(tickBond - tickStart); // signed, and its sign IS the direction
const moved = Number(tick - tickStart);
const progress = span === 0 ? 1 : Math.max(0, Math.min(1, moved / span));

console.log(`
${symbol}  ${token}
  creator        ${creator}
  hook           ${hook}
  locker         ${locker}
  splitter       ${splitter}
  positionId     ${positionId}

  tax            ${buyTaxBps / 100}% buy / ${sellTaxBps / 100}% sell
  all-in per trade ${Number(fees[0]) / 100}% buy / ${Number(fees[1]) / 100}% sell   (tax + the pool's own 1%)

  poolId         ${poolId}
    derived here and read from the hook: ${poolId === onChainPoolId ? "AGREE" : "DISAGREE - check the key"}
  sqrtPriceX96   ${sqrtPriceX96}
  tick           ${tick}   (token is currency${tokenIsToken0 ? "0" : "1"})
  price          $${price.toPrecision(6)}
  FDV            $${fdv.toLocaleString(undefined, {maximumFractionDigits: 0})}

  tickStart      ${tickStart}
  tickBond       ${tickBond}${bondBound ? "" : "   (NOT YET BOUND on the hook: the latch is inert)"}
  bonded         ${isBonded ? "yes" : `no, ${(progress * 100).toFixed(1)}% of the way`}
`);

if (hookBondTick !== tickBond) {
  console.error(`WARNING: hook.bondTick() ${hookBondTick} != launches word 9 ${tickBond}.`);
}

/**
 * Trades, if you want them. Swap is emitted by the PoolManager SINGLETON, so
 * the pool id in topic 1 is the only thing separating this token's trades from
 * every other v4 trade on Arc: filtering by address alone returns the chain.
 *
 * The data is SIX words, v3's five plus a trailing uint24 `fee`. The amounts
 * are declared int128 but arrive sign-extended across the full 32-byte word, so
 * a v3 decoder reads them correctly after truncating to five words.
 *
 * Arc caps eth_getLogs at 10,000 blocks per request AND 20,000 results per
 * response, refusing the whole query either way, and mines ~170,000 blocks a
 * day. So this asks for one 10,000-block page, not a lifetime scan.
 */
const head = await client.getBlockNumber();
const swaps = await client.getLogs({
  address: POOL_MANAGER,
  event: {
    type: "event",
    name: "Swap",
    inputs: [
      {name: "id", type: "bytes32", indexed: true},
      {name: "sender", type: "address", indexed: true},
      {name: "amount0", type: "int128"},
      {name: "amount1", type: "int128"},
      {name: "sqrtPriceX96", type: "uint160"},
      {name: "liquidity", type: "uint128"},
      {name: "tick", type: "int24"},
      {name: "fee", type: "uint24"},
    ],
  },
  args: {id: poolId},
  fromBlock: head - 9_999n,
  toBlock: head,
});
console.log(`  ${swaps.length} swaps in the last 10,000 blocks (~85 minutes)\n`);
