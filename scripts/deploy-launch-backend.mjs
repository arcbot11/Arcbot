// Invoked by the user to deploy the operator lock commands to the existing backend.
import {spawnSync} from 'node:child_process';
const key=process.env.CONVEX_DEPLOY_KEY,url=process.env.NEXT_PUBLIC_CONVEX_URL;
const deployment=key?.match(/^(dev|prod):([^|]+)\|/);
if(!deployment||!url||new URL(url).hostname!==`${deployment[2]}.convex.cloud`){
  console.error('Deployment key must identify the same existing Convex backend as NEXT_PUBLIC_CONVEX_URL. Nothing was deployed.');process.exit(1);
}
console.log(`Deploying operator locks to the existing ${deployment[1]} backend: ${new URL(url).hostname}`);
const result=spawnSync(process.execPath,['--use-system-ca','node_modules/convex/bin/main.js','deploy','--env-file','.env.local','--typecheck','enable'],{stdio:'inherit',windowsHide:true});
process.exit(result.status??1);
