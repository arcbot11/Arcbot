import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Abi, type Address } from "viem";
import { discoverArgusPool } from "../arc/argus-discovery";
import { arcConfigFromEnv } from "../arc/config";
import { checkArcRpc, createArcRpc, type ArcRpc, type ArcBlock } from "../arc/rpc";
import { PORTAL7 } from "../launches/contracts";
import { PORTAL8, PORTAL8_CREATOR_REGISTRY, verifyPortal8 } from "../launches/portal8";
import { amount, emptyReport, feeReportInput, unallocated, type Asset, type FeeReport } from "./model";

const abi = parseAbi([
  "function token() view returns(address)", "function quoteAsset() view returns(address)",
  "function payoutAsset() view returns(address)", "function creator() view returns(address)",
  "function rewardTracker() view returns(address)", "function symbol() view returns(string)",
  "function accountedQuote6() view returns(uint256)", "function accountedToken18() view returns(uint256)",
  "function pendingPrincipalQuote6() view returns(uint256)", "function pendingPrincipalToken18() view returns(uint256)",
  "function creatorBps() view returns(uint16)", "function burnBps() view returns(uint16)",
  "function dividendBps() view returns(uint16)", "function liquidityBps() view returns(uint16)",
  "function treasuryBps() view returns(uint16)", "function claimableQuote6(address) view returns(uint256)",
  "function claimableToken18(address) view returns(uint256)", "function claimableUsdc6(address) view returns(uint256)",
  "function heldPayout() view returns(uint256)", "function totalPaid() view returns(uint256)",
  "function portal() view returns(address)", "function creatorRegistry() view returns(address)",
  "function escrowOf(address) view returns(address)", "function payoutOf(address) view returns(address)",
  "function payoutSplit(address) view returns(address[],uint16[])", "function owedCreator() view returns(uint256)",
]);
const implementations = ["6c8f50b8895d5a22c97e611b8f9678a09d045b16", "d9578dd861b2fe59675c2c4b09b026fcb0df37fc", "8557df2c0aa88218e581cd455421d2f52a572854"];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
type Launch = NonNullable<Awaited<ReturnType<typeof discoverArgusPool>>>;
export type FeeReportDependencies = {
  rpc: ArcRpc; head(): Promise<ArcBlock>;
  discover?: typeof discoverArgusPool;
  verifyPortal8?: typeof verifyPortal8;
};

/** Reads only. No signer, wallet repository, approvals or transaction submission. */
export async function readFeeReport(rawInput: unknown, dependencies?: FeeReportDependencies): Promise<FeeReport> {
  const input = feeReportInput.parse(rawInput), report = emptyReport(input);
  try {
    const config = dependencies ? null : arcConfigFromEnv();
    const rpc = dependencies?.rpc ?? createArcRpc(config!);
    const head = await (dependencies ? dependencies.head() : checkArcRpc(rpc, config!));
    if (await rpc.chainId() !== 5042) throw Error("Wrong chain");
    report.evidence = { blockNumber: String(head.number), blockHash: head.hash,
      blockTimestamp: new Date(Number(head.timestamp) * 1000).toISOString(), observedAt: new Date().toISOString() };
    const read = async <T>(to: Address, functionName: string, args: readonly unknown[] = []): Promise<T> =>
      decodeFunctionResult({ abi, functionName, data: await rpc.call({ from: zeroAddress, to, value: 0n,
        data: encodeFunctionData({ abi: abi as Abi, functionName, args }) }, head.number) }) as T;
    const meta = async (address: Address): Promise<Asset> => {
      if (same(address, zeroAddress)) throw Error("Native asset needs an explicit adapter");
      const decimals = await rpc.decimals(address, head.number);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw Error("Invalid decimals");
      let symbol: string | null = null;
      try { symbol = (await read<string>(address, "symbol")).replace(/[\p{C}]/gu, "").slice(0, 32); } catch { /* Symbol is optional, units are not. */ }
      return { address, decimals, symbol };
    };
    const finish = async () => {
      if ((await rpc.block(head.number)).hash !== head.hash) throw Error("Observation block changed");
      return report;
    };
    if (!(await rpc.code(input.token, head.number))?.replace(/^0x$/, "")) {
      report.status = "unsupported"; report.warnings.push("Input is not a deployed token contract."); return await finish();
    }
    const launch = await (dependencies?.discover ?? discoverArgusPool)(input.token, rpc, head.number);
    if (!launch) { report.status = "unsupported"; report.warnings.push("No supported Argus launch record found."); return await finish(); }
    const quote = same(launch.pool.currency0, input.token) ? launch.pool.currency1 : launch.pool.currency0;
    const [actualToken, actualQuote] = await Promise.all([read<Address>(launch.splitter, "token"), read<Address>(launch.splitter, "quoteAsset")]);
    if (!same(actualToken, input.token) || !same(actualQuote, quote) || same(quote, input.token)) throw Error("Fee contract identity mismatch");
    report.contracts = { portal: launch.portal, splitter: launch.splitter, tracker: null };
    if (same(launch.portal, PORTAL8)) {
      await (dependencies?.verifyPortal8 ?? verifyPortal8)(rpc, head.number);
      const [portal, registry, bound, control, split, payoutAddress, owed] = await Promise.all([
        read<Address>(launch.splitter, "portal"), read<Address>(launch.splitter, "creatorRegistry"),
        read<Address>(PORTAL8_CREATOR_REGISTRY, "escrowOf", [input.token]),
        read<Address>(PORTAL8_CREATOR_REGISTRY, "payoutOf", [input.token]),
        read<readonly [Address[], number[]]>(PORTAL8_CREATOR_REGISTRY, "payoutSplit", [input.token]),
        read<Address>(launch.splitter, "payoutAsset"), read<bigint>(launch.splitter, "owedCreator"),
      ]);
      if (!same(portal, PORTAL8) || !same(registry, PORTAL8_CREATOR_REGISTRY) || !same(bound, launch.splitter) || same(control, zeroAddress)) throw Error("Escrow registry mismatch");
      const recipients = split[0].length ? split[0] : [control], shares = split[0].length ? split[1] : [10000];
      if (recipients.length !== shares.length || shares.reduce((a,b)=>a+b,0) !== 10000 || recipients.some(a=>same(a,zeroAddress))) throw Error("Invalid beneficiary split");
      const [tokenAsset, quoteAsset, payout] = await Promise.all([meta(input.token), meta(quote), meta(payoutAddress)]);
      report.assets = { token: tokenAsset, quote: quoteAsset, payout };
      report.family = "portal8-escrow"; report.status = "partial";
      report.beneficiaries = recipients.map((address,i)=>({address,shareBps:shares[i]}));
      report.creatorOwed = [amount(quoteAsset, owed)]; report.signals.creatorFeesOwed = owed > 0n;
      report.balances = await balances(rpc, head.number, launch, [quoteAsset,tokenAsset]);
      report.warnings.push("Portal 8 creator debt is denominated in quote units, not guaranteed payout proceeds. Registered recipients may include an identity vault.",
        "Portal 8 unallocated funds, allocation percentages, holder funds and liquidity reserves are not covered by this adapter yet.");
    } else {
      const code = (await rpc.code(launch.splitter, head.number))?.toLowerCase();
      if (!implementations.some(i=>code===`0x363d3d373d3d3d363d73${i}5af43d82803e903d91602b57fd5bf3`)) {
        report.status="unsupported"; report.warnings.push("Fee implementation is not covered by the legacy adapter."); return await finish();
      }
      const [creator,tracker] = await Promise.all([read<Address>(launch.splitter,"creator"),read<Address>(launch.splitter,"rewardTracker")]);
      if (same(creator,zeroAddress)) throw Error("Creator missing");
      let payoutAddress = quote;
      if (!same(tracker,zeroAddress)) {
        const [tracked,tokenTracker,payout] = await Promise.all([read<Address>(tracker,"token"),read<Address>(input.token,"rewardTracker"),read<Address>(tracker,"payoutAsset")]);
        if (!same(tracked,input.token)||!same(tokenTracker,tracker)) throw Error("Reward tracker mismatch");
        payoutAddress=payout; report.contracts.tracker=tracker;
      }
      const [tokenAsset,quoteAsset,payout] = await Promise.all([meta(input.token),meta(quote),meta(payoutAddress)]);
      report.assets={token:tokenAsset,quote:quoteAsset,payout}; report.family="legacy-splitter";
      report.beneficiaries=[{address:creator,shareBps:10000}];
      const fields=["accountedQuote6","accountedToken18","pendingPrincipalQuote6","pendingPrincipalToken18","creatorBps","burnBps","dividendBps","liquidityBps","treasuryBps"];
      const values=await Promise.all(fields.map(f=>read<bigint|number>(launch.splitter,f)));
      const [aq,at,pq,pt]=values.slice(0,4).map(BigInt),[cr,bu,ho,li,tr]=values.slice(4).map(Number);
      if ([cr,bu,ho,li,tr].some(v=>v<0||v>10000)||cr+bu+ho+li!==10000) throw Error("Invalid allocation");
      report.allocationBps={creator:cr,burn:bu,holders:ho,liquidity:li,treasury:tr};
      report.balances=await balances(rpc,head.number,launch,[quoteAsset,tokenAsset]);
      const uq=unallocated(BigInt(report.balances[0].raw),aq),ut=unallocated(BigInt(report.balances[1].raw),at);
      report.unallocated=[amount(quoteAsset,uq),amount(tokenAsset,ut)];
      report.liquidityReserved=[amount(quoteAsset,pq),amount(tokenAsset,pt)];
      const [cq,ct]=await Promise.all([read<bigint>(launch.splitter,"claimableQuote6",[creator]),read<bigint>(launch.splitter,"claimableToken18",[creator])]);
      report.creatorOwed=[amount(quoteAsset,cq),amount(tokenAsset,ct)];
      if (same(launch.portal,PORTAL7)) {
        // Portal 7 may also credit canonical USDC, separately from its quote bucket.
        const { ARC_USDC } = await import("../arc/config");
        const extra=await read<bigint>(launch.splitter,"claimableUsdc6",[creator]);
        if (extra>0n) report.creatorOwed.push(amount(await meta(ARC_USDC),extra));
      }
      if (!same(tracker,zeroAddress)) {
        const [funded,held,paid]=await Promise.all([rpc.tokenBalance(payout.address,tracker,head.number),read<bigint>(tracker,"heldPayout"),read<bigint>(tracker,"totalPaid")]);
        report.holderRewards={funded:amount(payout,funded),held:amount(payout,held),available:amount(payout,unallocated(funded,held)),totalPaid:amount(payout,paid)};
      }
      report.signals={unprocessedFees:uq>0n||ut>0n,creatorFeesOwed:report.creatorOwed.some(a=>BigInt(a.raw)>0n)};
      report.warnings.push("Creator/burn/holder/liquidity percentages apply after treasury allocation; they are not five additive percentages.");
      report.status="complete";
    }
    return await finish();
  } catch {
    // Do not publish a partially assembled snapshot as authoritative after a failed critical read.
    const failed=emptyReport(input); failed.warnings.push("Fee report unavailable: a required RPC, identity or accounting check failed. Unknown is not zero."); return failed;
  }
}
async function balances(rpc: ArcRpc, block: bigint, launch: Launch, assets: Asset[]) {
  return Promise.all(assets.map(async a=>amount(a,await rpc.tokenBalance(a.address,launch.splitter,block))));
}
