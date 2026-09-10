import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { RecordValue } from "./model";

export function repository() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL, secret = process.env.OTC_SERVICE_SECRET;
  if (!url || !secret || secret.length < 32) throw new Error("OTC storage is not configured.");
  const client = new ConvexHttpClient(url);
  return {
    identity: async (owner:string,address:string):Promise<boolean> => client.query(makeFunctionReference<"query">("otc:identity"),{secret,owner,address}) as Promise<boolean>,
    command: async <T = RecordValue>(command: string, input: unknown): Promise<T> => client.mutation(makeFunctionReference<"mutation">("otc:command"), { secret, command, json: JSON.stringify(input) }) as Promise<T>,
    read: async <T = RecordValue>(input: {id?:string;owner?:string;work?:boolean} = {}): Promise<T> => client.query(makeFunctionReference<"query">("otc:read"),{secret,...input}) as Promise<T>,
  };
}
