import {expect,it} from 'vitest';
import {arcConfigFromEnv} from '../lib/arc/config';
const env={ARC_MAINNET_RPC_URL:'https://example.quiknode.pro/key',ARC_CHECKPOINT_NUMBER:'18456078',ARC_CHECKPOINT_HASH:'0xdd5a48032af8571d6a262f39e5cde7e6b91625aaa4330289f03e5a346dd3c358',ARC_INFURA_RPC_URL:'https://old.example'};
it('uses only tested default providers and advances the exact legacy checkpoint',()=>{
 const c=arcConfigFromEnv(env);
 expect(c.rpcFallbackUrls).toEqual(['https://rpc.mainnet.arc.io']);
 expect(c.readOnlyRpcUrls).toEqual([]);
 expect(c.checkpointNumber).toBe(21065497n);
 expect(c.checkpointHash).toBe('0xdba68d53cfd9677309247a79359fe7d01599447d69f84f69a958bc179a6cdf07');
});
it('preserves operator-specified checkpoints and fallback overrides',()=>{
 const c=arcConfigFromEnv({...env,ARC_CHECKPOINT_NUMBER:'123',ARC_RPC_FALLBACK_URLS:'https://backup.example'});
 expect(c.checkpointNumber).toBe(123n);expect(c.checkpointHash).toBe(env.ARC_CHECKPOINT_HASH);
 expect(c.rpcFallbackUrls).toEqual(['https://backup.example']);
});
