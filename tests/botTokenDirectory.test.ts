import { expect, it } from "vitest";
import { ARGOS_TOKEN, directoryTokens } from "../lib/launches/token-directory";
it("admits only verified directory addresses, not impersonating tickers or unrelated launches",()=>{
  const rows=directoryTokens([{address:"0x"+"1".repeat(40),symbol:"ARGOS",marketCap:999999},
    {address:ARGOS_TOKEN.toUpperCase(),name:"Forged name",marketCap:20000,volume24h:1000,holders:100,status:"graduated",milestoneProgress:100}]);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:"Argos Bot",symbol:"ARGOS",marketCap:20000,graduated:true});
});
it("retains ARGOS without invented prices or chart data when the API fails",()=>{
  expect(directoryTokens(null)[0]).toMatchObject({address:ARGOS_TOKEN,marketCap:null,volume24h:null,holders:null,sparkline:[]});
});
it("rejects invalid metrics and bounds chart/progress data",()=>{
  expect(directoryTokens([{address:ARGOS_TOKEN,marketCap:-1,volume24h:Infinity,change24h:-10,milestoneProgress:150,sparkline:[NaN,-1,1,2]}])[0])
    .toMatchObject({marketCap:null,volume24h:null,change24h:-10,progress:100,sparkline:[1,2]});
});

it("adds receipt-verified new launches once without relying on the Argus feed",()=>{const token={address:"0x"+"1".repeat(40),symbol:"NEW",name:"New token",description:"",pair:"ARCASH",image:"https://pbs.twimg.com/media/new.jpg",featured:false,launchHash:"0x"+"1".repeat(64)};const rows=directoryTokens(null,[token,token]);expect(rows).toHaveLength(2);expect(rows[1]).toMatchObject({symbol:"NEW",pair:"ARCASH",marketCap:null});});
