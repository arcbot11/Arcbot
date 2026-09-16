import { launchRegistryRows } from "./registry-pages";
import { directoryTokens, type BOT_LAUNCH_DIRECTORY } from "./token-directory";
import { launchImageSource } from "./image";
export async function loadLaunchDirectory(){
  const [market,registry]=await Promise.allSettled([
    fetch("https://arguspad.io/api/tokens",{cache:"no-store",signal:AbortSignal.timeout(8000)}).then(async r=>{if(!r.ok)throw Error("Market unavailable");const data=await r.json();return Array.isArray(data)?data:data.tokens;}),
    launchRegistryRows<typeof BOT_LAUNCH_DIRECTORY[number]>("directory"),
  ]);
  const verified=registry.status==="fulfilled"?(registry.value as typeof BOT_LAUNCH_DIRECTORY).map(t=>({...t,image:launchImageSource(t.image)})):[];
  const payload=market.status==="fulfilled"?market.value:null;
  return {tokens:directoryTokens(payload,verified),marketAvailable:Array.isArray(payload),registryAvailable:registry.status==="fulfilled",updatedAt:Date.now()};
}
