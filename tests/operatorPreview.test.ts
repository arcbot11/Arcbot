import { expect, it, vi } from "vitest";
import { prepareOperatorPreview } from "../lib/arc/operator-preview";
it("retries temporary RPC preparation failures, then returns the fresh preview", async () => {
  const prepare=vi.fn().mockRejectedValueOnce({name:"UnknownRpcError"}).mockResolvedValue({amount:"26.997944"});
  const wait=vi.fn().mockResolvedValue(undefined);
  expect(await prepareOperatorPreview(prepare,wait)).toEqual({amount:"26.997944"});
  expect(prepare).toHaveBeenCalledTimes(2);
});
it("stops after three failed preparations", async () => {
  const error={name:"UnknownRpcError"};const prepare=vi.fn().mockRejectedValue(error);
  await expect(prepareOperatorPreview(prepare,async()=>{})).rejects.toBe(error);
  expect(prepare).toHaveBeenCalledTimes(3);
});
it("does not retry contract reverts or definite balance errors", async () => {
  for(const error of [{name:"UnknownRpcError",cause:{code:3}},{name:"UnknownRpcError",cause:{data:"0x12345678"}},new Error("Not enough funds")]){
    const prepare=vi.fn().mockRejectedValue(error);
    await expect(prepareOperatorPreview(prepare,async()=>{})).rejects.toBe(error);
    expect(prepare).toHaveBeenCalledTimes(1);
  }
});
