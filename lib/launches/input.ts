import { launchImageURI } from "./image";
import { z } from "zod";
import { formatUnits, getAddress, keccak256, parseUnits, toHex, type Address } from "viem";
import { LaunchError, LAUNCH_TAX_BPS, LAUNCH_DIVIDEND_MINIMUM_TOKENS } from "./policy";
import { ALLOCATION_KEYS, completeAllocation, parseAllocation, type Allocation } from "./allocation";

const cleanText = (limit: number) => z.string().transform(s => s.trim().normalize("NFC"))
  .refine(s => s.length <= limit && !/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(s), "Invalid text or length.");
const bps = z.number().int().min(0).max(10_000);
const decimal = (places: number) => z.string().max(80).regex(new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${places}})?$`));
const link = cleanText(100).refine(s => {
  if (!s) return true;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password && !/\s/.test(s); }
  catch { return false; }
}, "Use an HTTPS link.").default("");
// Pure validation only. Preparation verifies the remote image separately.
const imageURI = z.string().transform((value, ctx) => {
  try { return launchImageURI(value); } catch { ctx.addIssue({ code: "custom", message: "Attach your logo on X, or use a direct X image link or an IPFS image link." }); return z.NEVER; }
});
const schema = z.object({
  name: cleanText(32).refine(s => s.length > 0 && !/[\r\n\t]/.test(s) && new TextEncoder().encode(s).length <= 32, "Use a shorter token name. Emoji and some characters take extra space."),
  symbol: z.string().transform(s => s.trim().toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{1,10}$/))
    .refine(s => s !== "USDC", "USDC is reserved for the chain currency."),
  pairToken: z.enum(["USDC", "ARGUS", "ARCASH"]).default("USDC"),
  imageURI, description: cleanText(280).default(""), website: link, twitter: link, telegram: link,
  buyTaxBps: z.literal(LAUNCH_TAX_BPS).default(LAUNCH_TAX_BPS), sellTaxBps: z.literal(LAUNCH_TAX_BPS).default(LAUNCH_TAX_BPS),
  creatorBps: bps, burnBps: bps, dividendBps: bps, liquidityBps: bps,
  devBuyUSDC: decimal(6).default("0"),
  dividendMinimumTokens: z.literal(LAUNCH_DIVIDEND_MINIMUM_TOKENS,
    { errorMap: () => ({ message: "Dividend minimum is fixed at 100,000 tokens." }) }).default(LAUNCH_DIVIDEND_MINIMUM_TOKENS),
}).strict().superRefine((v, ctx) => {
  if (v.creatorBps + v.burnBps + v.dividendBps + v.liquidityBps !== 10_000)
    ctx.addIssue({ code: "custom", message: "Reward allocations must total 100%." });
  const validDevBuy = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(v.devBuyUSDC);
  if (validDevBuy && parseUnits(v.devBuyUSDC, 6) >= 2n ** 256n)
    ctx.addIssue({ code: "custom", message: "Dev buy exceeds the contract limit." });
});
export type LaunchInput = z.infer<typeof schema>;
export type LaunchIdentity = { owner: string; address: Address };
export function parseLaunchInput(input: unknown): LaunchInput {
  let resolved = input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const source = input as Record<string, unknown>, { allocationText, ...rest } = source;
    if ([source.buyTaxBps, source.sellTaxBps].some(value => value !== undefined && value !== LAUNCH_TAX_BPS))
      throw new LaunchError("FIXED_TAX", "Buy and sell tax are fixed at 1% each.");
    const hasNumbers = ALLOCATION_KEYS.some(key => source[key] !== undefined);
    if (allocationText !== undefined && (typeof allocationText !== "string" || hasNumbers))
      throw new LaunchError("ALLOCATION", "Use allocation text or allocation percentages, not both.");
    const allocation = allocationText !== undefined ? parseAllocation(allocationText as string)
      : completeAllocation(Object.fromEntries(ALLOCATION_KEYS.filter(key => source[key] !== undefined).map(key => [key, source[key]])) as Partial<Allocation>);
    const { remainderToCreatorBps, ...shares } = allocation;
    void remainderToCreatorBps;
    resolved = { ...rest, ...shares };
  }
  const result = schema.safeParse(resolved);
  if (!result.success) throw new LaunchError("INVALID_INPUT", result.error.issues[0]?.message ?? "Invalid launch settings.");
  return { ...result.data, devBuyUSDC: formatUnits(parseUnits(result.data.devBuyUSDC, 6), 6) };
}
export function launchIdentity(owner: string, address: string): LaunchIdentity {
  if (!/^(tg:)?[0-9]{1,30}$/.test(owner)) throw new LaunchError("IDENTITY", "Wallet ownership could not be verified.");
  const normalized = getAddress(address);
  if (BigInt(normalized) === 0n) throw new LaunchError("IDENTITY", "Wallet ownership could not be verified.");
  return { owner, address: normalized };
}
export function launchFingerprint(identity: LaunchIdentity, input: LaunchInput) {
  return keccak256(toHex(JSON.stringify({ version: 1, owner: identity.owner, creator: identity.address.toLowerCase(), input: parseLaunchInput(input) })));
}
