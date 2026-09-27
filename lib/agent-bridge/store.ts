import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Job } from "./model";
import { serviceSecret } from "./config";
export interface JobStore {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  save(
    job: Job,
    expected: number,
    reservation?: "keep" | "acquire" | "release",
  ): Promise<Job>;
  due(): Promise<string[]>;
  defer(id: string): Promise<void>;
}
export function jobStore(): JobStore {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw Error("Missing persistence");
  const client = new ConvexHttpClient(url),
    secret = serviceSecret();
  const query = <T>(name: string, args: Record<string, unknown>) =>
    client.query(makeFunctionReference<"query">(`agentBridge:${name}`), {
      secret,
      ...args,
    }) as Promise<T>;
  const mutation = <T>(name: string, args: Record<string, unknown>) =>
    client.mutation(makeFunctionReference<"mutation">(`agentBridge:${name}`), {
      secret,
      ...args,
    }) as Promise<T>;
  return {
    create: (j) => mutation("create", { json: JSON.stringify(j) }),
    get: (id) => query("get", { id }),
    save: (j, expected, reservation = "keep") =>
      mutation("save", { json: JSON.stringify(j), expected, reservation }),
    due: () => query("due", {}),
    defer: (id) => mutation("defer", { id }),
  };
}
