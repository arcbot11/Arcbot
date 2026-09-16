import {expect,it,vi} from "vitest";
import {launchReadCache} from "../lib/launches/read-cache";
import {launchImageFromText} from "../lib/launches/image";
import {collectLaunchPages} from "../lib/launches/registry-pages";
import type {ArcRpc} from "../lib/arc/rpc";
it("shares pinned calls but never caches block, nonce, balance or fees",async()=>{
  const call=vi.fn().mockResolvedValue("0x"),block=vi.fn().mockResolvedValue({}),nonce=vi.fn().mockResolvedValue(1),fees=vi.fn().mockResolvedValue({});
  const rpc=launchReadCache({call,block,nonce,fees} as unknown as ArcRpc),tx={from:"0x1",to:"0x2",data:"0x",value:0n} as Parameters<ArcRpc["call"]>[0];
  await Promise.all([rpc.call(tx,1n),rpc.call(tx,1n)]);expect(call).toHaveBeenCalledTimes(1);
  await rpc.call(tx,2n);expect(call).toHaveBeenCalledTimes(2);
  await rpc.block(1n);await rpc.block(1n);expect(block).toHaveBeenCalledTimes(2);
  await rpc.nonce(tx.from,true);await rpc.nonce(tx.from,true);expect(nonce).toHaveBeenCalledTimes(2);
  await rpc.fees();await rpc.fees();expect(fees).toHaveBeenCalledTimes(2);
});
it("retries failed pinned reads",async()=>{
  const call=vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValue("0x");
  const rpc=launchReadCache({call} as unknown as ArcRpc),tx={} as Parameters<ArcRpc["call"]>[0];
  await expect(rpc.call(tx,1n)).rejects.toThrow();await expect(rpc.call(tx,1n)).resolves.toBe("0x");expect(call).toHaveBeenCalledTimes(2);
});
it("extracts the supported thumbnail from X text while rejecting arbitrary hosts",()=>{
  const image="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxSXfJ1OwltWjWWusU8jPpOnyQAdr1uGXjhmoz5QBLdQ&s=10";
  expect(launchImageFromText("launch TEST image "+image)).toBe(new URL(image).toString());
  expect(launchImageFromText("image https://internal.example/test.png")).toBe("");
});
it("loads beyond the former 500-row limit",async()=>{
  const read=vi.fn(async(cursor:string|null)=>{const start=Number(cursor??0);return {page:Array.from({length:200},(_,i)=>start+i),isDone:start===400,continueCursor:String(start+200)};});
  const rows=await collectLaunchPages(read);expect(rows).toHaveLength(600);expect(rows.at(-1)).toBe(599);
});
it("rejects repeated pagination cursors instead of hanging",async()=>{
  await expect(collectLaunchPages(async()=>({page:[],isDone:false,continueCursor:"same"}))).rejects.toThrow("did not advance");
});
