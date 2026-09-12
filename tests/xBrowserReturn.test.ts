import {it,expect} from "vitest";
import {NextRequest} from "next/server";
import {xBrowserReturn} from "../lib/x-browser-return";
import {oauthBrowserHint,oauthCookieName} from "../lib/x-oauth-attempt";
const state="v2_"+"a".repeat(43),site="https://www.argosbot.io";
it.each([["ff","org.mozilla.firefox"],["ch","com.android.chrome"]])("targets the original %s browser with generic wording",async(hint,pkg)=>{
 const request=new NextRequest(site+"/api/auth/x/callback?"+new URLSearchParams({state:`v3_${hint}_`+"a".repeat(43),code:"code"}),{headers:{"user-agent":"Android X in-app browser"}});
 const html=await xBrowserReturn(request,site)!.text();
 expect(html).toContain(`package=${pkg};end`);expect(html.match(/<a /g)).toHaveLength(1);
 expect(html).toContain(">Finish sign-in in browser</a>");expect(html).not.toContain("Finish sign-in in Firefox");
});
it("uses the initiating user agent only as a presentation hint",()=>{
 expect(oauthBrowserHint("Android Firefox/140.0")).toBe("ff");expect(oauthBrowserHint("iPhone FxiOS/140.0")).toBe("ff");
 expect(oauthBrowserHint("Android Chrome/140.0")).toBe("ch");expect(oauthBrowserHint("Android Chrome/140.0 EdgA/140.0")).toBe("other");
 expect(oauthCookieName("v3_evil_"+"a".repeat(43))).toBeNull();expect(oauthCookieName("v3_ff_"+"a".repeat(43))).not.toBeNull();
});
it("escapes callback parameters and pins Android handoff to the configured origin",async()=>{
 const code='test&x=1#Intent;package=evil;end"><script>alert(1)</script>';
 const request=new NextRequest("https://untrusted.invalid/api/auth/x/callback?"+new URLSearchParams({state,code}),{headers:{"user-agent":"Android"}});
 const r=xBrowserReturn(request,site)!;const html=await r.text();
 expect(html).toContain("intent://www.argosbot.io/api/auth/x/callback?");expect(html).not.toContain("untrusted.invalid");expect(html).not.toContain("<script>");expect(html).not.toContain("#Intent;package=evil");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");expect(r.headers.get("cache-control")).toBe("no-store");
});
it("encodes the entire callback for Firefox on iOS",async()=>{
 const r=xBrowserReturn(new NextRequest(site+"/api/auth/x/callback?"+new URLSearchParams({state,code:"a&b"}),{headers:{"user-agent":"iPhone"}}),site)!;
 const html=await r.text(),href=/href="(firefox:[^"]+)"/.exec(html)![1];
 const callback=new URL(new URL(href).searchParams.get("url")!);
 expect(callback.searchParams.get("code")).toBe("a&b");expect(callback.searchParams.get("state")).toBe(state);
});
