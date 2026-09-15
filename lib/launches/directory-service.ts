import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { directoryTokens, type BOT_LAUNCH_DIRECTORY } from "./token-directory";
import { launchImageSource } from "./image";
export async function loadLaunchDirectory(){
  const [market,registry]=await Promise.allSettled([
    fetch("https://arguspad.io/api/tokens",{cache:"no-store",signal:AbortSignal.timeout(8000)}).then(async r=>{if(!r.ok)throw Error("Market unavailable");const data=await r.json();return Array.isArray(data)?data:data.tokens;}),
    process.env.NEXT_PUBLIC_CONVEX_URL?new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL).query(makeFunctionReference<"query">("launchExecution:directory"),{}):Promise.resolve([]),
  ]);
  const verified=registry.status==="fulfilled"?(registry.value as typeof BOT_LAUNCH_DIRECTORY).map(t=>({...t,image:launchImageSource(t.image)})):[];
  const payload=market.status==="fulfilled"?market.value:null;
  return {tokens:directoryTokens(payload,verified),marketAvailable:Array.isArray(payload),registryAvailable:registry.status==="fulfilled",updatedAt:Date.now()};
}
