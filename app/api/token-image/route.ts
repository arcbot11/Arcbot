import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

function blockedIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

function blockedIp(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return blockedIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  // Only global-unicast IPv6. This also excludes mapped IPv4, NAT64 and local forms.
  return !/^[23][0-9a-f]{3}:/.test(normalized) || normalized.startsWith("2002:") || /^2001:0{0,3}:/.test(normalized);
}

async function validateUrl(raw: string) {
  if (raw.length > 2_048) throw new Error("image URL is too long");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("image URL is not allowed");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("image host is not allowed");
  const directIp = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
  if (!directIp.length || directIp.some(blockedIp)) throw new Error("image host is not public");
  return {url, address:directIp[0], family:isIP(directIp[0]) as 4|6};
}

/** Keep TLS verification and Host tied to the URL, but connect only to the checked IP. */
async function pinnedImage(target: Awaited<ReturnType<typeof validateUrl>>) {
  return new Promise<{status:number;location?:string;bytes?:Uint8Array;contentType?:string}>((resolve,reject)=>{
    const req=httpsRequest(target.url,{
      agent:false,
      // A fresh socket per redirect; no second DNS lookup or pooled connection.
      lookup:(_hostname,options,callback)=>{
        if(options.all)callback(null,[{address:target.address,family:target.family}]);
        else callback(null,target.address,target.family);
      },
      signal:AbortSignal.timeout(8_000),
      headers:{accept:"image/avif,image/webp,image/png,image/jpeg,image/gif","user-agent":"ArgosBot-ImageProxy/1.0"},
    },response=>{
      const status=response.statusCode??0;
      if(status>=300&&status<400){response.destroy();resolve({status,location:response.headers.location});return;}
      const contentType=response.headers["content-type"]?.split(";",1)[0].trim().toLowerCase()??"";
      const declared=Number(response.headers["content-length"]??0);
      if(status<200||status>=300||!IMAGE_TYPES.has(contentType)||declared>MAX_IMAGE_BYTES){response.destroy();reject(Error("image response is not allowed"));return;}
      const chunks:Buffer[]=[];let total=0;
      response.on("data",(chunk:Buffer)=>{
        total+=chunk.length;
        if(total>MAX_IMAGE_BYTES){response.destroy();reject(Error("image is too large"));return;}
        chunks.push(chunk);
      });
      response.on("error",reject);
      response.on("aborted",()=>reject(Error("image response interrupted")));
      response.on("end",()=>resolve({status,bytes:new Uint8Array(Buffer.concat(chunks)),contentType}));
    });
    req.on("error",reject);
    req.end();
  });
}
async function fetchImage(raw: string) {
  let target=await validateUrl(raw);
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
    const response=await pinnedImage(target);
    if(response.status>=300&&response.status<400){
      if(!response.location||redirects===MAX_REDIRECTS)throw Error("too many image redirects");
      target=await validateUrl(new URL(response.location,target.url).toString());
      continue;
    }
    if(!response.bytes||!response.contentType)throw Error("image request failed");
    return {bytes:response.bytes,contentType:response.contentType};
  }
  throw Error("image request failed");
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
  try {
    const image = await fetchImage(source);
    return new NextResponse(new Uint8Array(image.bytes), { headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    return new NextResponse(null, { status: 307, headers: { location: "/brand/argos-dog-favicon.png", "cache-control": "public, max-age=300" } });
  }
}
