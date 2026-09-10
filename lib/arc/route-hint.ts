import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { routeCurrencies, type Route } from "./routing";

export type VerifiedRoute = { route: Route; verifiedHookPoolIds: string[]; block: bigint; hash: string; expires: number };
type Context = { wallet: string; tokenIn: string; tokenOut: string; scope: string };
const asset = (value: string) => ["native", "0x0000000000000000000000000000000000000000", "0x3600000000000000000000000000000000000000"].includes(value.toLowerCase()) ? "native" : value.toLowerCase();
const binding = (context: Context) => createHash("sha256").update(JSON.stringify([context.wallet.toLowerCase(), asset(context.tokenIn), asset(context.tokenOut), context.scope])).digest("hex");
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(`arc-route-v1:${payload}`).digest();

/** Signed identities, never a price, allowance or authorization to spend. */
export function createRouteHint(route: VerifiedRoute, context: Context) {
  const secret = process.env.WEB_AUTH_SECRET;
  if (!secret) return undefined;
  const payload = Buffer.from(JSON.stringify({ ...route, block: route.block.toString(), binding: binding(context) })).toString("base64url");
  return `${payload}.${mac(payload, secret).toString("base64url")}`;
}
export function readRouteHint(hint: string | undefined, context: Context): VerifiedRoute | null {
  const secret = process.env.WEB_AUTH_SECRET;
  if (!hint || !secret || hint.length > 6000) return null;
  try {
    const [payload, signature, extra] = hint.split(".");
    if (!payload || !signature || extra) return null;
    const supplied = Buffer.from(signature, "base64url"), expected = mac(payload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.binding !== binding(context) || !Number.isFinite(data.expires) || data.expires <= Date.now()
      || !/^\d+$/.test(data.block) || !/^0x[0-9a-f]{64}$/i.test(data.hash) || !Array.isArray(data.verifiedHookPoolIds)) return null;
    routeCurrencies(data.route);
    if (asset(data.route.tokenIn) !== asset(context.tokenIn) || asset(data.route.tokenOut) !== asset(context.tokenOut)) return null;
    return { route: data.route, verifiedHookPoolIds: data.verifiedHookPoolIds, block: BigInt(data.block), hash: data.hash, expires: data.expires };
  } catch { return null; }
}
