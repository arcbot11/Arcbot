import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { type LookupStore, type LookupCache, type Pair, type Report } from "./model";

export type RequestRecord = { requestId: string; inputKey: string; state: string; resultJson?: string; receiptJson?: string };
export interface ApiStore extends LookupStore {
  limit(key: string): Promise<boolean>;
  claim(input: { paymentKey: string; inputKey: string; recoveryHash: string; requestId: string }): Promise<{ kind: string; request?: RequestRecord }>;
  update(requestId: string, state: string, resultJson?: string, receiptJson?: string): Promise<void>;
  recover(requestId: string, recoveryHash: string): Promise<RequestRecord | null>;
}
export function apiStore(): ApiStore {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.BRIDGE_API_SERVICE_SECRET;
  if (!url || !secret) throw Error("Bridge API persistence is not configured");
  const client = new ConvexHttpClient(url);
  const query = <T>(name: string, args: Record<string, unknown>) => client.query(makeFunctionReference<"query">(`bridgeApi:${name}`), { secret, ...args }) as Promise<T>;
  const mutate = <T>(name: string, args: Record<string, unknown>) => client.mutation(makeFunctionReference<"mutation">(`bridgeApi:${name}`), { secret, ...args }) as Promise<T>;
  return {
    getCache: key => query<LookupCache | null>("cache", { key }),
    getPair: (chain, token) => query<Pair | null>("pair", { chain, token }),
    save: (key, report: Report, pairs: Pair[]) => mutate<void>("save", { key, report: JSON.stringify(report), pairs: JSON.stringify(pairs) }),
    limit: key => mutate<boolean>("limit", { key }),
    claim: input => mutate("claim", input),
    update: (requestId, state, resultJson, receiptJson) => mutate<void>("updateRequest", { requestId, state, ...(resultJson ? { resultJson } : {}), ...(receiptJson ? { receiptJson } : {}) }),
    recover: (requestId, recoveryHash) => mutate("recover", { requestId, recoveryHash }),
  };
}
