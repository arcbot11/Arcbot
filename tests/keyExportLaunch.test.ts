import {expect,it} from "vitest";
import {exportLaunch} from "../lib/key-export/launch";
const ticket="a".repeat(64);
it("preserves Telegram's signed initData beside the ticket before URL clearing",()=>{
 const data='auth_date=123&user=%7B%22id%22%3A123%7D&signature=abc&hash=def';
 expect(exportLaunch(`#ticket=${ticket}&tgWebAppData=${encodeURIComponent(data)}&tgWebAppVersion=9.0`)).toEqual({ticket,telegramData:data});
});
it("supports the ordinary X fragment and OAuth return",()=>{expect(exportLaunch(`#${ticket}`).ticket).toBe(ticket);expect(exportLaunch("")).toEqual({ticket:undefined,telegramData:undefined});});
it.each([`#ticket=${ticket}&ticket=${ticket}`,"#ticket=bad","#tgWebAppData=one&tgWebAppData=two"])("rejects ambiguous or invalid launch %s",input=>expect(()=>exportLaunch(input)).toThrow());
