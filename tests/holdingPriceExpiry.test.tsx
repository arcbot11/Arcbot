import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HoldingCard } from "../components/ArcTokenBalances";
vi.stubGlobal("React",React);
it("keeps the token quantity but hides an expired card valuation",()=>{
  const token={address:"0x1111111111111111111111111111111111111111",symbol:"ARGOS",name:"Argos",balance:"123",usdValue:42,pricedAt:"2000-01-01T00:00:00Z"};
  const render=(pricedAt:string)=>renderToStaticMarkup(<HoldingCard token={{...token,pricedAt}} onError={()=>{}} busy={false}/>);
  expect(render(token.pricedAt)).toContain("123 ARGOS");
  expect(render(token.pricedAt)).not.toContain("$42");
  expect(render(new Date().toISOString())).toContain("$42");
});
