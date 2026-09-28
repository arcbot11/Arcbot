import {beforeEach, expect, it, vi} from "vitest";
import {encodeAbiParameters, type Hex} from "viem";
import {feeTopics, historyId, type FeeHistory} from "../lib/fee-report/history";
import {emptyReport, feeReportInput} from "../lib/fee-report/model";
import {feeHistoryCommand} from "../convex/lib/feeHistoryCommands";
import type {RecordValue, Store} from "../lib/otc/model";
const m=vi.hoisted(()=>({read:vi.fn(),command:vi.fn(),report:vi.fn(),logs:vi.fn(),block:vi.fn(),code:vi.fn()}));
vi.mock("viem",async original=>({...await original<typeof import("viem")>(),createPublicClient:()=>({request:m.logs})}));
vi.mock("../lib/otc/repository",()=>({repository:()=>({read:m.read,command:m.command})}));
vi.mock("../lib/fee-report/read",()=>({readFeeReport:m.report}));
vi.mock("../lib/arc/config",()=>({arcConfigFromEnv:()=>({rpcUrl:"https://rpc.invalid",rpcFallbackUrls:["https://fallback.invalid"],readOnlyRpcUrls:[]}),arcChain:()=>({})}));
vi.mock("../lib/arc/transport",()=>({arcTransport:()=>({})}));
vi.mock("../lib/arc/rpc",()=>({createArcRpc:()=>({block:m.block,code:m.code}),checkArcRpc:async()=>({})}));
import {runFeeHistory,readServiceFeeReport} from "../lib/fee-report/history-service";
const token=`0x${"11".repeat(20)}` as const,quote=`0x${"22".repeat(20)}` as const,hook=`0x${"33".repeat(20)}` as const,locker=`0x${"44".repeat(20)}` as const,hash=`0x${"12".repeat(32)}` as Hex;
let row:FeeHistory;
beforeEach(()=>{
 vi.clearAllMocks();
 row={kind:"fee_history",id:historyId(token),owner:"service:fee-history",binding:{token,quote,hook,locker,family:"portal8-escrow"},revision:0,nextBlock:"0",targetBlock:"10",throughHash:null,tokenTotal:"0",quoteTotal:"0",updatedAt:0,scheduledAt:0};
 m.read.mockImplementation(async()=>structuredClone(row));
 const store:Store={get:async<T extends RecordValue>(_id:string)=>structuredClone(row) as unknown as T|null,put:async v=>{row=v as FeeHistory;}};
 m.command.mockImplementation((c,i)=>feeHistoryCommand({scheduler:{runAfter:vi.fn()}} as never,store,c,i,1000000));
 m.report.mockResolvedValue({...emptyReport(feeReportInput.parse({token})),status:"partial",family:"portal8-escrow",contracts:{portal:locker,splitter:locker,tracker:null,hook,locker},assets:{token:{address:token,decimals:18,symbol:"T"},quote:{address:quote,decimals:6,symbol:"Q"}},evidence:{blockNumber:"20"}});
 m.block.mockImplementation(async number=>({number,hash}));m.code.mockResolvedValue(`0x7f${feeTopics.quote.slice(2)}`);
 m.logs.mockResolvedValue([{address:hook,topics:[feeTopics.quote],data:encodeAbiParameters([{type:"uint256"},{type:"uint256"},{type:"bool"},{type:"bool"}],[100n,9n,true,true]),blockNumber:"0x5",blockHash:hash,transactionHash:hash,transactionIndex:"0x0",logIndex:"0x0",removed:false}]);
});
it("checkpoints the full range and does not replay it after completion",async()=>{
 expect(await runFeeHistory(row.id)).toMatchObject({pending:false});expect(row).toMatchObject({nextBlock:"11",quoteTotal:"100",tokenTotal:"0",revision:1});
 expect(await runFeeHistory(row.id)).toMatchObject({pending:false});expect(m.logs).toHaveBeenCalledTimes(1);
});
it("restarts totals after a checkpoint reorg",async()=>{
 Object.assign(row,{nextBlock:"5",throughHash:`0x${"34".repeat(32)}`,quoteTotal:"999"});
 await runFeeHistory(row.id);expect(row).toMatchObject({quoteTotal:"100",revision:2});expect(m.command).toHaveBeenCalledWith("fee_history_commit",expect.objectContaining({reset:true,quoteTotal:"0"}));
});
it("does not commit if the observed block changes mid-scan",async()=>{
 m.block.mockResolvedValueOnce({number:10n,hash}).mockResolvedValue({number:10n,hash:`0x${"34".repeat(32)}`});
 await expect(runFeeHistory(row.id)).rejects.toThrow(/changed/);expect(row.nextBlock).toBe("0");
});
it("does not return zero when the hook lacks the supported event",async()=>{
 m.code.mockResolvedValue("0x01");await expect(runFeeHistory(row.id)).rejects.toThrow(/not covered/);expect(m.logs).not.toHaveBeenCalled();expect(m.command).not.toHaveBeenCalled();
});
it("retains a checkpoint on unavailable RPC rather than skipping blocks",async()=>{
 m.logs.mockRejectedValue(Error("unavailable"));await expect(runFeeHistory(row.id)).rejects.toThrow();expect(row.nextBlock).toBe("0");expect(m.command).not.toHaveBeenCalled();
});
it("attaches verified cached totals and requests an incremental refresh without transaction work",async()=>{
 Object.assign(row,{nextBlock:"11",throughHash:hash,quoteTotal:"100"});
 const report=await readServiceFeeReport({token});expect(report.lifetimeFeesEarned?.throughBlock).toBe("10");expect(m.command).toHaveBeenCalledWith("fee_history_request",expect.objectContaining({targetBlock:"20"}));expect(m.logs).not.toHaveBeenCalled();
});
it("tries the same range on another verified provider before shrinking",async()=>{
 m.logs.mockRejectedValueOnce(Error("provider range cap"));expect(await runFeeHistory(row.id)).toMatchObject({pending:false,progressed:true});expect(m.logs).toHaveBeenCalledTimes(2);
 expect(m.logs.mock.calls[0]).toEqual(m.logs.mock.calls[1]);
});
it("skips only the proven pre-deployment interval",async()=>{
 m.code.mockImplementation(async(_address,block)=>block<5n?"0x":`0x7f${feeTopics.quote.slice(2)}`);
 await runFeeHistory(row.id);expect(m.command).toHaveBeenCalledWith("fee_history_commit",expect.objectContaining({nextBlock:"5",quoteTotal:"0"}));
 expect(m.logs.mock.calls[0][0].params[0].fromBlock).toBe("0x5");expect(row.quoteTotal).toBe("100");
});
