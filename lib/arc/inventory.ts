import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
import {createPublicClient,parseAbiItem,type Address} from 'viem';
import {arcTransport} from './transport';
import type {ArcConfig} from './config';
export type Inventory={entries:{token:string;balance?:string;symbol?:string;name?:string;block?:string;observedAt?:number}[];truncated:boolean;cursor:{block:string;hash:string;oldest?:string}|null};
function storage(){
  const url=process.env.NEXT_PUBLIC_CONVEX_URL,secret=process.env.OTC_SERVICE_SECRET;
  return url&&secret?{client:new ConvexHttpClient(url),secret}:null;
}
export async function readInventory(wallet:string):Promise<Inventory>{
  const s=storage();if(!s)return {entries:[],truncated:false,cursor:null};
  return s.client.query(makeFunctionReference<'query'>('walletInventory:read'),{secret:s.secret,wallet:wallet.toLowerCase()});
}
export async function saveInventory(wallet:string,block:string,entries:Inventory['entries'],cursor?:{block:string;hash:string;oldest?:string;previous:string|null}){
  const s=storage();if(!s)return;
  await s.client.mutation(makeFunctionReference<'mutation'>('walletInventory:save'),{secret:s.secret,wallet:wallet.toLowerCase(),block,entries:entries.slice(0,1000).map(e=>({token:e.token.toLowerCase(),...(e.balance!==undefined?{balance:e.balance}:{}),...(e.symbol?{symbol:e.symbol.slice(0,100)}:{}),...(e.name?{name:e.name.slice(0,200)}:{})})),...(cursor?{cursor}:{})});
}
const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
export async function discoverInventory(wallet:Address,config:ArcConfig,head:bigint,inventory:Inventory){
  const client=createPublicClient({transport:arcTransport(config)});
  const clamp=(n:bigint)=>n<config.checkpointNumber?config.checkpointNumber:n;
  let start=inventory.cursor?BigInt(inventory.cursor.block)-12n:head-1023n;
  if(inventory.cursor&&(await client.getBlock({blockNumber:BigInt(inventory.cursor.block)})).hash?.toLowerCase()!==inventory.cursor.hash.toLowerCase())start=BigInt(inventory.cursor.block)-128n;
  start=clamp(start);if(start>head)start=head;
  const end=start+1023n<head?start+1023n:head;
  let oldest=BigInt(inventory.cursor?.oldest??start.toString());
  const ranges:Array<[bigint,bigint]>=[[start,end]];
  if(inventory.cursor&&end===head&&oldest>config.checkpointNumber){const from=clamp(oldest-1024n);ranges.push([from,oldest-1n]);oldest=from;}
  const before=await client.getBlock({blockNumber:end});
  const logs=(await Promise.all(ranges.flatMap(([fromBlock,toBlock])=>[
    client.getLogs({event:transfer,args:{to:wallet},fromBlock,toBlock}),
    client.getLogs({event:transfer,args:{from:wallet},fromBlock,toBlock}),
  ]))).flat();
  if(logs.length>1000||logs.some(l=>l.removed))throw Error('Token event scan incomplete.');
  if(!before.hash||(await client.getBlock({blockNumber:end})).hash!==before.hash)throw Error('Token event scan changed.');
  const tokens=[...new Set(logs.map(l=>l.address.toLowerCase()))];
  return {tokens,partial:end<head||oldest>config.checkpointNumber,cursor:{block:end.toString(),hash:before.hash,oldest:oldest.toString(),previous:inventory.cursor?.block??null}};
}
