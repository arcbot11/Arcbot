import {it,expect} from 'vitest';
import {backfillSales,market} from '../convex/otc';
type Row=Record<string,unknown>&{_id:string};
it('backfills in bounded pages, counts each sale once, and serves the market without reading order history',async()=>{
 const tables:Record<string,Row[]>={otcRecords:Array.from({length:135},(_,i)=>({_id:`r${i}`,key:`order:${i}`,kind:'order',status:'completed',json:JSON.stringify({kind:'order',id:`order:${i}`,status:'completed',amount:'10000000'})})),otcSales:[],otcMarketStats:[]};
 const reads:string[]=[];let next=0;
 const ctx={db:{query(table:string){reads.push(table);let rows=tables[table];const filter={eq(key:string,value:unknown){rows=rows.filter(r=>r[key]===value);return filter;}};
  return{withIndex(_name:string,fn:(q:typeof filter)=>unknown){fn(filter);return{unique:async()=>rows[0]??null,collect:async()=>rows,paginate:async({cursor,numItems}:{cursor:string|null;numItems:number})=>{const start=Number(cursor??0);return{page:rows.slice(start,start+numItems),isDone:start+numItems>=rows.length,continueCursor:String(start+numItems)};}};}};},
  async insert(table:string,value:Record<string,unknown>){const row={...value,_id:`new${next++}`};tables[table].push(row);return row._id;},
  async get(id:string){return Object.values(tables).flat().find(r=>r._id===id)??null;},
  async patch(id:string,value:Record<string,unknown>){Object.assign(Object.values(tables).flat().find(r=>r._id===id)!,value);}},scheduler:{runAfter:async()=>null}};
 const run=(backfillSales as unknown as {_handler:(ctx:unknown,args:{cursor:string|null})=>Promise<void>})._handler;
 await run(ctx,{cursor:null});expect(tables.otcSales).toHaveLength(100);expect(tables.otcMarketStats[0].ready).toBe(false);
 await run(ctx,{cursor:'100'});expect(tables.otcMarketStats[0]).toMatchObject({ready:true,soldUsdc:'1350000000'});
 await run(ctx,{cursor:null});expect(tables.otcSales).toHaveLength(135);expect(tables.otcMarketStats[0].soldUsdc).toBe('1350000000');
 reads.length=0;
 const result=await(market as unknown as {_handler:(ctx:unknown,args:object)=>Promise<{stats:{soldUsdc:string}}>})._handler(ctx,{});
 expect(result.stats.soldUsdc).toBe('1350000000');expect(reads).toEqual(['otcRecords','otcMarketStats']);
});
