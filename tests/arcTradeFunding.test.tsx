import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {it,expect} from "vitest";
import {ArcTradeFunding} from "../components/ArcTradeFunding";
import type {FundingDetails} from "../lib/arc/trade-plan";
const funding:FundingDetails={paired:true,inputAddress:"0xece5ca8bf9220718e5727754026757512212cb3c",inputSymbol:"ARGUS",inputAmount:"1000",outputAddress:"0x2222222222222222222222222222222222222222",outputSymbol:"BABYARGUS",quoteAddress:"0xece5ca8bf9220718e5727754026757512212cb3c",quoteSymbol:"ARGUS",mode:"quote"};
it("clearly labels ARGUS spending without relabeling it as USDC",()=>{const html=renderToStaticMarkup(<ArcTradeFunding funding={funding} side="buy"/>);expect(html).toContain("Spending 1,000 ARGUS");expect(html).toContain("ARGUS → BABYARGUS");expect(html).not.toContain("USDC");});
it("labels USDC fallback and the intermediate ARGUS hop",()=>{const html=renderToStaticMarkup(<ArcTradeFunding funding={{...funding,inputAddress:"native",inputSymbol:"USDC",inputAmount:"20",mode:"usdc"}} side="buy"/>);expect(html).toContain("Spending 20.00 USDC");expect(html).toContain("USDC → ARGUS → BABYARGUS");});
it("shows the sold token and ARGUS output",()=>{const html=renderToStaticMarkup(<ArcTradeFunding funding={{...funding,inputSymbol:"BABYARGUS",outputSymbol:"ARGUS",mode:"sell"}} side="sell"/>);expect(html).toContain("Selling 1,000 BABYARGUS");expect(html).toContain("BABYARGUS → ARGUS");expect(html).not.toContain("USDC");});
