import { loadLaunchDirectory } from "@/lib/launches/directory-service";
import { json } from "@/lib/otc/http";
export const dynamic="force-dynamic";
export async function GET(){
  return json(await loadLaunchDirectory());
}
