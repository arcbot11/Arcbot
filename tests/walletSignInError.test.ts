import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {it,expect,vi,afterEach} from "vitest";
vi.mock("../components/SiteChrome",()=>({SiteHeader:()=>null,SiteFooter:()=>null}));
import Page from "../app/wallet/sign-in-error/page";
afterEach(()=>vi.unstubAllGlobals());
it.each([false,true])("only displays Return to Telegram for a Telegram attempt: %s",async telegram=>{
 vi.stubGlobal("React",React);
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({reason:"invalid_state",...(telegram?{telegram:"1"}:{})})}));
 expect(html.includes("Return to Telegram")).toBe(telegram);
});
