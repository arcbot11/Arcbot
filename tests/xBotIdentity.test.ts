import { afterEach, describe, expect, it, vi } from "vitest";
import { isXBotAuthor, xBotUserId } from "../lib/x-bot-identity";
import { executeCommand, authorizeArcCommand } from "../convex/wallets";

afterEach(()=>vi.unstubAllEnvs());
describe("X bot author identity",()=>{
  it("recognizes the verified account even with missing or stale configuration",()=>{
    vi.stubEnv("X_BOT_USER_ID","");expect(isXBotAuthor("2097696306135220226")).toBe(true);
    vi.stubEnv("X_BOT_USER_ID","old-account");expect(isXBotAuthor(xBotUserId())).toBe(true);
    expect(isXBotAuthor("old-account","another_user")).toBe(false);
    expect(isXBotAuthor(undefined,"@aRcChAiNbOt")).toBe(true);expect(isXBotAuthor("another-user","arctos_arc")).toBe(false);
  });
  it("rejects all self-authored commands before parsing, lookups, or wallet work",async()=>{
    const handler=(executeCommand as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<{ok:boolean}>})._handler;
    for(const text of ["buy 10 ARGUS","wallet","send 1 USDC","help"]){
      expect(await handler({}, {sourcePostId:"tweet",xUserId:xBotUserId(),text})).toMatchObject({ok:false});
    }
  });
  it("rejects queued bot commands at Arc signing authorization",async()=>{
    vi.stubEnv("WEB_AUTH_SECRET","test-secret");
    const runQuery=vi.fn(async()=>({source:"x",ownerXUserId:xBotUserId(),status:"received"}));
    const handler=(authorizeArcCommand as unknown as {_handler:(ctx:unknown,args:unknown)=>Promise<unknown>})._handler;
    await expect(handler({runQuery},{secret:"test-secret",requestId:"queued"})).rejects.toThrow("not authorized");
    expect(runQuery).toHaveBeenCalledTimes(1);
  });
});
