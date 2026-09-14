import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {loadTokenBalances,type TokenBalanceSnapshot} from "../lib/load-token-balances";
import {retainTokenBalances} from "../lib/token-balance-display";
const address="0x1111111111111111111111111111111111111111";
const token={address:"0x2222222222222222222222222222222222222222",symbol:"TOKEN",name:"Token",balance:"12"};
const snapshot=(partial=false,tokens:TokenBalanceSnapshot["tokens"]=[token]):TokenBalanceSnapshot=>({walletAddress:address,partial,tokens});
const fetchMock=vi.fn();
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("retries transient failures then displays the recovered token list",async()=>{
  fetchMock.mockRejectedValueOnce(Error("offline")).mockRejectedValueOnce(Error("offline")).mockResolvedValue(Response.json(snapshot()));
  const update=vi.fn(),job=loadTokenBalances("/api/wallet/tokens",address,new AbortController().signal,update);
  await vi.runAllTimersAsync();await job;
  expect(fetchMock).toHaveBeenCalledTimes(3);expect(update).toHaveBeenCalledWith(snapshot());
});
it("shows partial results while retrying, then replaces them with the complete snapshot",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json(snapshot(true,[]))).mockResolvedValueOnce(Response.json(snapshot()));
  const update=vi.fn(),job=loadTokenBalances("/api/wallet/tokens",address,new AbortController().signal,update);
  await vi.runAllTimersAsync();await job;
  expect(update.mock.calls).toEqual([[snapshot(true,[])],[snapshot()]]);
});
it("stops after three failed attempts",async()=>{
  fetchMock.mockRejectedValue(Error("offline"));
  const job=loadTokenBalances("/api/wallet/tokens",address,new AbortController().signal,vi.fn());
  const rejected=expect(job).rejects.toThrow("offline");await vi.runAllTimersAsync();await rejected;
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("cancels retries when the account changes or the page unmounts",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json(snapshot(true,[])));
  const controller=new AbortController(),update=vi.fn();
  const job=loadTokenBalances("/api/wallet/tokens",address,controller.signal,update);
  const rejected=expect(job).rejects.toThrow();await vi.advanceTimersByTimeAsync(0);controller.abort();await rejected;
  await vi.runAllTimersAsync();expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("never displays a response from a different wallet",async()=>{
  fetchMock.mockImplementation(async()=>Response.json({...snapshot(),walletAddress:token.address}));
  const update=vi.fn(),job=loadTokenBalances("/api/wallet/tokens",address,new AbortController().signal,update);
  const rejected=expect(job).rejects.toThrow();await vi.runAllTimersAsync();await rejected;expect(update).not.toHaveBeenCalled();
});
it("keeps unread holdings but removes verified zeros, including from a partial refresh",()=>{
  expect(retainTokenBalances(snapshot(),snapshot(true,[]))).toEqual([{...token,stale:true}]);
  expect(retainTokenBalances(snapshot(),{...snapshot(true,[]),verifiedAddresses:[token.address]})).toEqual([]);
  expect(retainTokenBalances(snapshot(),snapshot(false,[]))).toEqual([]);
  expect(retainTokenBalances(snapshot(),{...snapshot(false,[]),verifiedAddresses:[]})).toEqual([{...token,stale:true}]);
});
it("updates a recovered holding without duplicates or a stale marker",()=>{
  expect(retainTokenBalances(snapshot(true,[{...token,stale:true}]),snapshot(true))).toEqual([token]);
});
