import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  createPublicClient,
  http,
  keccak256,
  padHex,
  type Address,
  type Hex,
} from "viem";
import {
  abi,
  chains,
  domains,
  IMPL_SLOT,
  MANAGER_IMPL,
  otherChain,
  ownerlessId,
  same,
  SERVICE,
  TOKEN_IMPL,
  TRANSMITTER,
  trustedDomainSlot,
  type BridgeChain,
  type Route,
} from "./contracts";
import {
  assertOwnerless,
  compatibleOriginal,
  MANAGER_PROXY_HASH,
  pins,
  WRAPPER_PROXY_HASH,
} from "./policy";
export function bridgeClient(chain: BridgeChain) {
  const url =
    (chain === 5042
      ? process.env.BRIDGE_ARC_RPC_URL || process.env.ARC_MAINNET_RPC_URL
      : process.env.BRIDGE_BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL) ||
    chains[chain].rpcUrls.default.http[0];
  if (new URL(url).protocol !== "https:")
    throw Error("Bridge RPC must use HTTPS.");
  return createPublicClient({
    chain: chains[chain],
    transport: http(url, {
      timeout: 12_000,
      retryCount: 2,
      batch: { wait: 20, batchSize: 20 },
    }),
  });
}
export type BridgeClient = ReturnType<typeof bridgeClient>;
export function contractAbsent(error: unknown) {
  return (
    error instanceof BaseError &&
    !!error
      .walk(
        (e) =>
          e instanceof ContractFunctionRevertedError ||
          e instanceof ContractFunctionZeroDataError,
      )
      ?.name.match(/ContractFunction(Reverted|ZeroData)Error/)
  );
}
export function notRegistered(error: unknown) {
  if (!(error instanceof BaseError)) return false;
  const cause = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return (
    cause instanceof ContractFunctionRevertedError &&
    cause.data?.errorName === "TokenNotRegistered"
  );
}
export class BridgeReads {
  constructor(private finalized = false) {}
  clients = { 5042: bridgeClient(5042), 8453: bridgeClient(8453) };
  private heads = new Map<
    BridgeChain,
    Promise<Awaited<ReturnType<BridgeClient["getBlock"]>>>
  >();
  private services = new Map<BridgeChain, Promise<void>>();
  head(chain: BridgeChain) {
    if (!this.heads.has(chain))
      this.heads.set(
        chain,
        (async () => {
          const c = this.clients[chain];
          const [id, head] = await Promise.all([
            c.getChainId(),
            c.getBlock({ blockTag: this.finalized ? "finalized" : "latest" }),
          ]);
          if (
            id !== chain ||
            head.number === null ||
            (!this.finalized &&
              Date.now() / 1000 - Number(head.timestamp) > 90) ||
            Number(head.timestamp) > Date.now() / 1000 + 30
          )
            throw Error("Bridge network identity or freshness check failed.");
          return head;
        })(),
      );
    return this.heads.get(chain)!;
  }
  async code(chain: BridgeChain, address: Address) {
    return (
      (await this.clients[chain].getCode({
        address,
        blockNumber: (await this.head(chain)).number!,
      })) ?? "0x"
    );
  }
  async recipientAllowed(route: Route, account: Address) {
    const providers = [
      await this.read<Address>(route.destination, SERVICE, "denylistProvider"),
    ];
    // Wrappers retain their own provider, which can differ from the service's.
    if (route.destination !== route.origin && route.counterpart)
      providers.push(
        await this.read<Address>(
          route.destination,
          route.counterpart,
          "denylistProvider",
        ),
      );
    for (const provider of new Set(
      providers.map((p) => p.toLowerCase() as Address),
    )) {
      if ((await this.code(route.destination, provider)) === "0x")
        throw Error("Destination denylist verification is unavailable.");
      if (
        await this.read<boolean>(route.destination, provider, "isDenylisted", [
          account,
        ])
      )
        throw Error("Recipient is blocked on the destination chain.");
    }
  }
  async read<T>(
    chain: BridgeChain,
    address: Address,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<T> {
    return (await this.clients[chain].readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber: (await this.head(chain)).number!,
    } as never)) as T;
  }
  async canonical() {
    for (const [chain, p] of this.heads) {
      const head = await p;
      if (
        (await this.clients[chain].getBlock({ blockNumber: head.number! }))
          .hash !== head.hash
      )
        throw Error("Bridge snapshot changed. Review again.");
    }
  }
  service(chain: BridgeChain) {
    if (!this.services.has(chain))
      this.services.set(
        chain,
        (async () => {
          const manifest = pins[chain],
            head = await this.head(chain);
          const [storage, paused, system, trusted, transmitter] =
            await Promise.all([
              this.clients[chain].getStorageAt({
                address: SERVICE,
                slot: IMPL_SLOT,
                blockNumber: head.number!,
              }),
              this.read<boolean>(chain, SERVICE, "paused"),
              this.read<boolean>(chain, SERVICE, "isSystemPaused"),
              this.read<boolean>(chain, SERVICE, "isTrustedDomain", [
                domains[otherChain(chain)],
              ]),
              this.read<Address>(chain, SERVICE, "messageTransmitter"),
            ]);
          if (
            !storage ||
            !same("0x" + storage.slice(-40), manifest.implementation.address) ||
            paused ||
            system ||
            !trusted ||
            !same(transmitter, TRANSMITTER)
          )
            throw Error("Circle route is paused, changed, or unavailable.");
          await Promise.all(
            Object.entries(manifest).map(async ([name, pin]) => {
              if (
                name !== "service" &&
                name !== "implementation" &&
                !same(
                  await this.read<Address>(chain, SERVICE, name),
                  pin.address,
                )
              )
                throw Error("Circle implementation changed; review required.");
              if (keccak256(await this.code(chain, pin.address)) !== pin.hash)
                throw Error("Circle code changed; review required.");
            }),
          );
          // Verify storage only after the implementation/layout pins pass.
          await this.trustedService(chain);
        })(),
      );
    return this.services.get(chain)!;
  }
  async trustedService(chain: BridgeChain) {
    const remote = await this.clients[chain].getStorageAt({
      address: SERVICE,
      slot: trustedDomainSlot(domains[otherChain(chain)]),
      blockNumber: (await this.head(chain)).number!,
    });
    if (!remote || !same(remote, padHex(SERVICE, { size: 32 })))
      throw Error(
        "Circle destination service mapping changed; review required.",
      );
  }
  async manager(chain: BridgeChain, id: Hex) {
    await this.service(chain);
    let address: Address;
    try {
      address = await this.read<Address>(
        chain,
        SERVICE,
        "resolveTokenManager",
        [id],
      );
    } catch (error) {
      if (notRegistered(error)) return null;
      throw error;
    }
    if (keccak256(await this.code(chain, address)) !== MANAGER_PROXY_HASH)
      throw Error("Unrecognized Circle manager.");
    const [
      token,
      type,
      owner,
      pending,
      assigner,
      service,
      implementation,
      paused,
    ] = await Promise.all([
      this.read<Address>(chain, address, "token"),
      this.read<number>(chain, address, "tokenManagerType"),
      this.read<Address>(chain, address, "owner"),
      this.read<Address>(chain, address, "pendingAssignedOwner"),
      this.read<Address>(chain, address, "ownershipAssigner"),
      this.read<Address>(chain, address, "service"),
      this.read<Address>(chain, address, "implementation"),
      this.read<boolean>(chain, address, "paused"),
    ]);
    assertOwnerless(owner, pending, assigner);
    if (
      !same(service, SERVICE) ||
      !same(implementation, MANAGER_IMPL) ||
      paused ||
      ![0, 2].includes(type)
    )
      throw Error("Unsupported or paused Circle manager.");
    if (type === 0) {
      if (keccak256(await this.code(chain, token)) !== WRAPPER_PROXY_HASH)
        throw Error("Unrecognized Circle wrapper.");
      const [actualId, impl, wo, wp, wa] = await Promise.all([
        this.read<Hex>(chain, token, "tokenId"),
        this.read<Address>(chain, token, "implementation"),
        this.read<Address>(chain, token, "owner"),
        this.read<Address>(chain, token, "pendingAssignedOwner"),
        this.read<Address>(chain, token, "ownershipAssigner"),
      ]);
      if (actualId !== id || !same(impl, TOKEN_IMPL))
        throw Error("Circle wrapper identity changed.");
      assertOwnerless(wo, wp, wa);
    }
    return { address, token, type };
  }
  async route(chain: BridgeChain, token: Address): Promise<Route | null> {
    const code = await this.code(chain, token);
    if (code === "0x") return null;
    const destination = otherChain(chain);
    await Promise.all([this.service(chain), this.service(destination)]);
    // Only a verified Circle wrapper may contribute a non-origin token ID.
    let wrapperId: Hex | undefined;
    try {
      wrapperId = await this.read<Hex>(chain, token, "tokenId");
    } catch (e) {
      if (!contractAbsent(e)) throw e;
    }
    let id = ownerlessId(chain, token),
      origin = chain,
      original = token;
    if (wrapperId) {
      const local = await this.manager(chain, wrapperId);
      if (!local || local.type !== 0 || !same(local.token, token))
        throw Error("Token claims an unverified bridge identity.");
      const remote = await this.manager(destination, wrapperId);
      if (
        !remote ||
        remote.type !== 2 ||
        ownerlessId(destination, remote.token) !== wrapperId
      )
        throw Error("Original token is not on the other supported chain.");
      id = wrapperId;
      origin = destination;
      original = remote.token;
    }
    const [local, remote, decimals, name, symbol, originalCode] =
      await Promise.all([
        this.manager(chain, id),
        this.manager(destination, id),
        this.read<number>(chain, token, "decimals"),
        this.read<string>(chain, token, "name"),
        this.read<string>(chain, token, "symbol"),
        this.code(origin, original),
      ]);
    if (
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 18 ||
      typeof name !== "string" ||
      typeof symbol !== "string"
    )
      throw Error("Unsupported token metadata.");
    if (
      local &&
      (!same(local.token, token) || local.type !== (origin === chain ? 2 : 0))
    )
      throw Error("Source token binding mismatch.");
    if (
      remote &&
      (remote.type !== (origin === destination ? 2 : 0) ||
        (await this.read<number>(destination, remote.token, "decimals")) !==
          decimals)
    )
      throw Error("Destination token binding mismatch.");
    if (!local && remote) throw Error("Inconsistent Circle registration.");
    const compatible = compatibleOriginal(
      origin,
      original,
      keccak256(originalCode),
      process.env.BRIDGE_REVIEWED_ORIGINALS,
    );
    const clean = (s: string) =>
      s
        .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "")
        .slice(0, 80);
    return {
      source: chain,
      destination,
      origin,
      original,
      token,
      tokenId: id,
      manager: local?.address,
      destinationManager: remote?.address,
      counterpart: remote?.token,
      name: clean(name),
      symbol: clean(symbol),
      decimals,
      state: !local ? "register" : !remote ? "deploy" : "ready",
      compatible,
      ...(!compatible
        ? {
            reason:
              "This original token needs a transfer-behavior compatibility review before bridging or setup is enabled.",
          }
        : {}),
    };
  }
}
export async function lookup(token: Address) {
  const reads = new BridgeReads();
  const results = await Promise.allSettled(
    ([5042, 8453] as const).map((chain) => reads.route(chain, token)),
  );
  await reads.canonical();
  return {
    candidates: results.flatMap((r) =>
      r.status === "fulfilled" && r.value ? [r.value] : [],
    ),
    uncertain: results.flatMap((r, i) =>
      r.status === "rejected"
        ? [
            {
              chain: i === 0 ? 5042 : 8453,
              message:
                "Could not verify this address on this chain. It may be unsupported or the network may be unavailable.",
            },
          ]
        : [],
    ),
  };
}
