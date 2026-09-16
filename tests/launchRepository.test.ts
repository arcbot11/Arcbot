import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ mutation: vi.fn(async (_ref: unknown, args: { json: string }) => JSON.parse(args.json)) }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: class { mutation = m.mutation; } }));
import { repository } from "../lib/otc/repository";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("persists live launch step values without failing before transaction creation or losing precision", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  vi.stubEnv("OTC_SERVICE_SECRET", "s".repeat(32));
  const input = { id: "launch:1:draft:0", leg: "launch", reserveWei: "123", launchStep: {
    preview: { steps: [{ call: { value: 0n, data: "0x1234" }, gasWei: "999" }] },
  }, exactInteger: 2n ** 200n };
  const saved = await repository().command<typeof input>("prepare", input);
  expect(m.mutation).toHaveBeenCalledTimes(1);
  expect(saved).toMatchObject({ id: input.id, reserveWei: "123", exactInteger: String(2n ** 200n),
    launchStep: { preview: { steps: [{ call: { value: "0", data: "0x1234" }, gasWei: "999" }] } } });
});
