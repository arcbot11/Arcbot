import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {BaseTokenCard} from '../components/BaseTokenBalances';
beforeEach(()=>vi.stubGlobal('React',React));afterEach(()=>vi.unstubAllGlobals());
const token={address:'0x3333333333333333333333333333333333333333',symbol:'ARGUS',name:'Argus',balance:'50'};
it('renders Base-specific contract links and a withdrawal button without Arc trading actions',()=>{
 const html=renderToStaticMarkup(<BaseTokenCard token={token} busy={false} onWithdraw={()=>{}}/>);
 expect(html).toContain('50');expect(html).toContain('Withdraw ARGUS');expect(html).toContain('https://basescan.org/token/'+token.address);expect(html).not.toContain('arcexplorer');expect(html).not.toContain('Sell');
});
it.each([{stale:true,busy:false},{stale:false,busy:true}])('disables withdrawals when stale or another action is running',({stale,busy})=>{
 expect(renderToStaticMarkup(<BaseTokenCard token={{...token,stale}} busy={busy} onWithdraw={()=>{}}/>)).toContain('disabled=""');
});
