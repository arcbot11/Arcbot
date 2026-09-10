import{readFileSync,writeFileSync}from'node:fs';import{encodeFunctionData,parseAbi,encodePacked,decodeFunctionResult}from'viem';
const path='docs/arc/rpc-capabilities-2026-09-10.json',report=JSON.parse(readFileSync(path));
async function probe(endpoint,label,method,params){const row={endpoint,label,method};try{const r=await fetch(report.endpoints[endpoint],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});const b=await r.json();Object.assign(row,{http:r.status,...b.error?{error:b.error}:{result:b.result}});}catch(e){row.error={message:e.message,code:e.cause?.code||e.name};}report.rows.push(row);console.log(JSON.stringify(row));return row.result;}
const receipt=report.rows.find(r=>r.label==='receipt lookup'&&r.endpoint==='argus').result;
const abi=parseAbi(['function getPool(address,address,uint24) view returns(address)','function quoteExactInput(bytes,uint256) returns(uint256,uint160[],uint32[],uint256)','function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)','function getLiquidity(bytes32) view returns(uint128)']);
const usdc='0x3600000000000000000000000000000000000000',token='0xbe0cad585ea2d13de2f4e36376be755c0afd8b97';
for(const endpoint of Object.keys(report.endpoints)){
 await probe(endpoint,'nonempty block logs','eth_getLogs',[{fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber,address:token}]);
 for(const [label,to,fn,args]of[['V3 pool discovery','0xf0db7b58379503491d857db50ac9ece64c653918','getPool',[usdc,token,10000]],['V3 quote','0x7dfd4f31be6814d2906bde155c3e1b146eac1468','quoteExactInput',[encodePacked(['address','uint24','address'],[usdc,10000,token]),1000000n]]])await probe(endpoint,label,'eth_call',[{to,data:encodeFunctionData({abi,functionName:fn,args})},report.fixture.block]);
}
const end=BigInt(report.fixture.block),start='0x'+(end-9999n).toString(16);
const logs=await probe('argus','V4 swap discovery','eth_getLogs',[{address:'0x8366a39cc670b4001a1121b8f6a443a643e40951',fromBlock:start,toBlock:report.fixture.block,topics:['0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f']}]);
writeFileSync(path,JSON.stringify(report,null,2));
