import { loadLaunchDirectory } from "@/lib/launches/directory-service";
import { json } from "@/lib/otc/http";
export const dynamic="force-dynamic";
export async function GET(){
  if(process.env.NODE_ENV!=="development")return json({error:"Not found."},404);
  return json(await loadLaunchDirectory());
}
