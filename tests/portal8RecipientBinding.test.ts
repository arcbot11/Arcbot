import {expect,it,vi} from 'vitest';
import {bindLaunchFeeDestination} from '../convex/xReplies';
const address='0x1111111111111111111111111111111111111111';
function fixture(){
 const row:Record<string,unknown>={_id:'row',recipientXUserId:'123',recipientAddress:address};
 const patch=vi.fn(async(_id:string,value:Record<string,unknown>)=>Object.assign(row,value));
 const q={withIndex:()=>q,unique:async()=>row};const ctx={db:{query:()=>q,patch}};
 const bind=(destination:unknown)=>(bindLaunchFeeDestination as any)._handler(ctx,{postId:'1',destinationJson:JSON.stringify(destination)}) as Promise<string>;
 return {row,patch,bind};
}
it('saves the immutable X ID from the resolved wallet binding',async()=>{
 const f=fixture();expect(JSON.parse(await f.bind({platform:'x',address,recipient:'@alice',userId:'999'}))).toMatchObject({userId:'123',address});
});
it('reuses the original destination on retry, even if a handle now resolves elsewhere',async()=>{
 const f=fixture(),first=await f.bind({platform:'x',address,recipient:'@alice'});
 expect(await f.bind({platform:'x',address:'0x2222222222222222222222222222222222222222',recipient:'@alice'})).toBe(first);expect(f.patch).toHaveBeenCalledTimes(1);
});
it('refuses a fee wallet that differs from the saved X binding',async()=>{
 const f=fixture();await expect(f.bind({platform:'x',address:'0x2222222222222222222222222222222222222222',recipient:'@alice'})).rejects.toThrow('binding changed');expect(f.patch).not.toHaveBeenCalled();
});
