import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { BridgeReads } from "../lib/bridge/read";
import { SERVICE, trustedDomainSlot } from "../lib/bridge/contracts";
import { encodeAbiParameters, keccak256, padHex, toHex, zeroHash } from "viem";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it.each(["/", "/bridge", "/wallet"])(
  "permits WalletConnect under production CSP including client navigation from %s",
  (path) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CSP_REPORT_ONLY", "false");
    const csp = middleware(
      new NextRequest(`https://www.argosbot.io${path}`),
    ).headers.get("Content-Security-Policy")!;
    const connect = csp
      .split(";")
      .find((s) => s.trim().startsWith("connect-src"))!;
    for (const origin of [
      "wss://relay.walletconnect.org",
      "https://api.web3modal.org",
      "https://rpc.mainnet.arc.io",
      "https://mainnet.base.org",
    ])
      expect(connect).toContain(origin);
    expect(connect).not.toMatch(/(?:\s|^)(?:https:|wss:|\*)(?:\s|$)/);
    expect(csp).toContain(
      "frame-src 'self' https://www.geckoterminal.com https://verify.walletconnect.org",
    );
  },
);
it.each([6, 26])(
  "derives domain %s mapping from the reviewed ERC-7201 layout",
  (domain) => {
    const namespace =
      BigInt(keccak256(toHex("circle.cctpx.CrossChainTokenService"))) - 1n;
    const root =
      BigInt(
        keccak256(encodeAbiParameters([{ type: "uint256" }], [namespace])),
      ) & ~255n;
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "uint32" }, { type: "uint256" }],
        [domain, root + 1n],
      ),
    );
    expect(trustedDomainSlot(domain)).toBe(expected);
  },
);
it.each([5042, 8453] as const)(
  "rejects changed or unavailable mapped services on chain %s",
  async (chain) => {
    const reads = new BridgeReads();
    vi.spyOn(reads, "head").mockResolvedValue({ number: 100n } as Awaited<
      ReturnType<typeof reads.head>
    >);
    const storage = vi.spyOn(reads.clients[chain], "getStorageAt");
    storage.mockResolvedValue(padHex(SERVICE, { size: 32 }));
    await expect(reads.trustedService(chain)).resolves.toBeUndefined();
    expect(storage).toHaveBeenCalledWith({
      address: SERVICE,
      slot: trustedDomainSlot(chain === 5042 ? 6 : 26),
      blockNumber: 100n,
    });
    for (const value of [zeroHash, padHex("0x1234", { size: 32 }), undefined]) {
      storage.mockResolvedValue(value);
      await expect(reads.trustedService(chain)).rejects.toThrow(
        "mapping changed",
      );
    }
    storage.mockRejectedValue(new Error("RPC unavailable"));
    await expect(reads.trustedService(chain)).rejects.toThrow(
      "RPC unavailable",
    );
  },
);
