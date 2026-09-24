"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatUnits, type Address, type Hex } from "viem";
import {
  chains,
  explorer,
  same,
  type BridgeChain,
  type Prepared,
  type Route,
} from "@/lib/bridge/contracts";
import {
  identity,
  sendReviewed,
  switchChain,
  type Provider,
  type Wallet,
} from "@/lib/bridge/browser";
import s from "./BridgePage.module.css";
import { useWalletSession } from "./WalletSessionProvider";
import {
  parseHistory,
  compactHistory,
  HISTORY_KEY as KEY,
  type BridgeEntry as Entry,
} from "@/lib/bridge/validation";
import { mergeRecovery } from "@/lib/bridge/recovery";
async function api(url: string, body?: unknown, csrf?: string) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body
      ? {
          "Content-Type": "application/json",
          ...(csrf ? { "x-argus-csrf": csrf } : {}),
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Bridge service unavailable.");
  return data;
}
function readEntries(): Entry[] {
  return parseHistory(localStorage.getItem(KEY));
}
async function updateHistory(action: () => void) {
  if (!navigator.locks)
    throw Error("Use a current browser to safely update bridge history.");
  await navigator.locks.request(
    "argos-external-bridge-send",
    { ifAvailable: true },
    (lock) => {
      if (!lock)
        throw Error(
          "Another bridge tab is submitting. Retry this status update after the wallet request.",
        );
      action();
    },
  );
}
export function BridgePage() {
  const [wallets, setWallets] = useState<Wallet[]>([]),
    [provider, setProvider] = useState<Provider>(),
    [externalAccount, setAccount] = useState<Address>(),
    [network, setNetwork] = useState<number>();
  const session = useWalletSession();
  const [mode, setMode] = useState<"connected" | "bot">("connected");
  const [botId, setBotId] = useState<string>();
  const account =
    mode === "bot"
      ? session?.authenticated && !session.needsReauth
        ? (session.walletAddress as Address)
        : undefined
      : externalAccount;
  useEffect(() => {
    invalidate();
  }, [
    mode,
    session?.walletAddress,
    session?.authenticated,
    session?.needsReauth,
  ]);
  const [token, setToken] = useState(""),
    [routes, setRoutes] = useState<Route[]>([]),
    [route, setRoute] = useState<Route>(),
    [uncertain, setUncertain] = useState(false),
    [amount, setAmount] = useState(""),
    [review, setReview] = useState<Prepared>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [loaded, setLoaded] = useState(false),
    [recover, setRecover] = useState(""),
    [recoverChain, setRecoverChain] = useState<BridgeChain>(5042);
  const epoch = useRef(0),
    locked = useRef(false);
  function invalidate() {
    epoch.current++;
    setReview(undefined);
    setBotId(undefined);
  }
  function persist(next: Entry[]) {
    const valid = compactHistory(next);
    localStorage.setItem(KEY, JSON.stringify(valid));
    setEntries(valid);
  }
  useEffect(() => {
    if (!review) return;
    const timer = setTimeout(
      () => {
        setReview(undefined);
        setError("Review expired. Request a fresh quote to continue.");
      },
      Math.max(0, review.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [review]);
  useEffect(() => {
    try {
      setEntries(readEntries());
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    }
    const announce = (e: Event) => {
      const w = (e as CustomEvent<Wallet>).detail;
      if (
        typeof w?.provider?.request === "function" &&
        typeof w.info?.uuid === "string" &&
        typeof w.info.name === "string"
      )
        setWallets((old) =>
          old.some((x) => x.info.uuid === w.info.uuid)
            ? old
            : [...old, w].slice(0, 20),
        );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const sync = () => {
      try {
        setEntries(readEntries());
        invalidate();
      } catch (e) {
        setError(String(e));
        setLoaded(false);
      }
    };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!provider) return;
    const changed = () => {
      invalidate();
      identity(provider)
        .then((v) => {
          setAccount(v.account);
          setNetwork(v.chain);
        })
        .catch(() => {
          setAccount(undefined);
          setNetwork(undefined);
        });
    };
    const disconnected = () => {
      invalidate();
      setAccount(undefined);
      setNetwork(undefined);
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", changed);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", changed);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  async function work(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bridge request failed.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function connect(p: Provider) {
    await p.request({ method: "eth_requestAccounts" });
    const id = await identity(p);
    invalidate();
    setProvider(p);
    setAccount(id.account);
    setNetwork(id.chain);
  }
  async function walletConnect() {
    const { EthereumProvider } =
      await import("@walletconnect/ethereum-provider");
    const p = await EthereumProvider.init({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
      optionalChains: [5042, 8453],
      showQrModal: true,
      rpcMap: {
        5042: chains[5042].rpcUrls.default.http[0],
        8453: chains[8453].rpcUrls.default.http[0],
      },
      metadata: {
        name: "Argos Bridge",
        description: "Arc and Base via Circle",
        url: window.location.origin,
        icons: [],
      },
    });
    await p.connect();
    await connect(p as unknown as Provider);
  }
  async function lookup() {
    invalidate();
    const version = epoch.current;
    setRoute(undefined);
    setRoutes([]);
    const found = await api("/api/bridge?token=" + encodeURIComponent(token));
    if (version !== epoch.current) return;
    setRoutes(found.candidates);
    setUncertain(found.uncertain.length > 0);
    if (found.candidates.length === 1 && !found.uncertain.length)
      setRoute(found.candidates[0]);
    if (!found.candidates.length && !found.uncertain.length)
      throw Error("No token contract found on Arc or Base.");
  }
  async function prepare() {
    if (!route || !account || (mode === "connected" && !provider)) return;
    if (mode === "connected" && network !== route.source) {
      await switchChain(provider!, route.source);
      const id = await identity(provider!);
      setNetwork(id.chain);
      return;
    }
    const version = epoch.current;
    const p = await api(
      mode === "bot" ? "/api/wallet/bridge" : "/api/bridge",
      {
        operation: "prepare",
        intent: {
          chain: route.source,
          token: route.token,
          ...(mode === "connected" ? { account } : {}),
          amount,
          action: route.state === "ready" ? "transfer" : route.state,
        },
      },
      mode === "bot" ? session?.csrfToken : undefined,
    );
    if (version !== epoch.current)
      throw Error("Wallet or form changed. Review again.");
    setReview(mode === "bot" ? p.prepared : p);
    setBotId(mode === "bot" ? p.id : undefined);
  }
  async function submit() {
    if (!review || (mode === "connected" && !provider)) return;
    const p = review;
    const version = epoch.current;
    if (!navigator.locks)
      throw Error(
        "This browser cannot safely coordinate wallet requests across tabs. Use a current browser.",
      );
    await navigator.locks.request(
      "argos-external-bridge-send",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw Error("Another bridge tab is submitting.");
        const saved = readEntries();
        if (
          saved.some(
            (e) => !["complete", "failed", "rejected"].includes(e.state),
          )
        )
          throw Error("Resolve the outstanding bridge transaction first.");
        if (mode === "bot") {
          if (
            !botId ||
            !account ||
            !same(account, p.intent.account) ||
            version !== epoch.current
          )
            throw Error("Wallet changed. Review again.");
          const entry: Entry = {
            id: crypto.randomUUID(),
            botId,
            chain: p.intent.chain,
            prepared: p,
            state: "unknown",
            message:
              "Confirmed Argos Bot Wallet request. Check status before retrying.",
          };
          persist([...saved, entry]);
          setReview(undefined);
          const result = await api(
            "/api/wallet/bridge",
            { operation: "confirm", prepared: p },
            session?.csrfToken,
          );
          persist(
            readEntries().map((e) =>
              e.id === entry.id ? botResult(entry, result) : e,
            ),
          );
          return;
        }
        await api("/api/bridge", { operation: "revalidate", prepared: p });
        const entry: Entry = {
          id: crypto.randomUUID(),
          chain: p.intent.chain,
          prepared: p,
          state: "unknown",
          message:
            "Wallet requested. If interrupted, recover with the transaction hash; do not resend.",
        };
        let hash: Hex;
        let requested = false;
        try {
          hash = await sendReviewed(provider!, p, () => {
            if (version !== epoch.current)
              throw Error("Wallet or form changed. Review again.");
            persist([...readEntries(), entry]);
            requested = true;
            setReview(undefined);
          });
        } catch (e) {
          if (requested && (e as { code?: number }).code === 4001)
            persist([
              ...readEntries().filter((e) => e.id !== entry.id),
              {
                ...entry,
                state: "rejected",
                message: "Wallet rejected the request.",
              },
            ]);
          throw e;
        }
        const submitted: Entry = {
          ...entry,
          hash,
          state: "pending",
          message: "Submitted. Waiting for source confirmation.",
        };
        try {
          persist([
            ...readEntries().filter((e) => e.id !== entry.id),
            {
              ...entry,
              hash,
              state: "pending",
              message: "Submitted. Waiting for source confirmation.",
            },
          ]);
        } catch {
          setEntries((current) => [
            ...current.filter((e) => e.id !== entry.id),
            submitted,
          ]);
          throw Error(
            `Transaction submitted: ${hash}. Browser storage failed. Save this hash and recover it; do not resend.`,
          );
        }
      },
    );
  }
  function botResult(
    entry: Entry,
    result: { id: string; hash?: Hex; status: string },
  ): Entry {
    if (result.id !== entry.botId)
      throw Error("Bridge request identity changed.");
    return {
      ...entry,
      ...(result.hash ? { hash: result.hash } : {}),
      state: result.hash
        ? "pending"
        : result.status === "cancelled"
          ? "rejected"
          : "unknown",
      message: result.hash
        ? "Source transaction recorded. Check status for bridge finality."
        : result.status === "cancelled"
          ? "Cancelled before signing. Request a fresh review."
          : "Argos Bot Wallet request is processing. Check status before submitting anything else.",
    };
  }
  async function retryBot(entry: Entry) {
    if (!entry.botId || !entry.prepared) return;
    const result = await api(
      "/api/wallet/bridge",
      { operation: "confirm", prepared: entry.prepared },
      session?.csrfToken,
    );
    await updateHistory(() =>
      persist(
        readEntries().map((e) =>
          e.id === entry.id ? botResult(e, result) : e,
        ),
      ),
    );
  }
  async function refresh(entry: Entry) {
    if (entry.botId && !entry.hash) {
      const result = await api(
        "/api/wallet/transaction?id=" + encodeURIComponent(entry.botId),
      );
      await updateHistory(() =>
        persist(
          readEntries().map((e) =>
            e.id === entry.id ? botResult(e, result) : e,
          ),
        ),
      );
      return;
    }
    if (!entry.hash || entry.supersededBy) return;
    const result = await api(
      `/api/bridge?chain=${entry.chain}&hash=${entry.hash}`,
    );
    if (result.binding?.finalized) {
      await updateHistory(() =>
        persist(
          mergeRecovery(
            readEntries(),
            entry.chain,
            entry.hash!,
            result,
            entry.id,
          ),
        ),
      );
      return;
    }
    if (entry.prepared && result.binding) {
      const p = entry.prepared,
        b = result.binding;
      if (
        !same(b.from, p.intent.account) ||
        !same(b.to || "", p.to) ||
        !same(b.data, p.data) ||
        b.value !== p.value ||
        b.nonce !== p.nonce
      )
        throw Error("Recovered transaction does not match the saved review.");
    }
    await updateHistory(() =>
      persist(
        readEntries().map((e) =>
          e.id === entry.id && !e.supersededBy ? { ...e, ...result } : e,
        ),
      ),
    );
  }
  async function continueEntry(entry: Entry) {
    if (!entry.prepared || entry.state !== "complete") return;
    invalidate();
    const version = epoch.current,
      p = entry.prepared;
    setToken(p.intent.token);
    setAmount(p.intent.amount);
    setRoute(undefined);
    setRoutes([]);
    const found = await api(
      "/api/bridge?token=" + encodeURIComponent(p.intent.token),
    );
    if (version !== epoch.current) return;
    const next = found.candidates.find((r: Route) => r.source === entry.chain);
    setRoutes(found.candidates);
    setUncertain(found.uncertain.length > 0);
    if (!next)
      throw Error(
        "The previous token route could not be verified. Try again later.",
      );
    setRoute(next);
  }
  async function importHash() {
    if (!/^0x[0-9a-fA-F]{64}$/.test(recover))
      throw Error("Enter the source transaction hash.");
    const result = await api(
      `/api/bridge?chain=${recoverChain}&hash=${recover}`,
    );
    await updateHistory(() =>
      persist(
        mergeRecovery(
          readEntries(),
          recoverChain,
          recover as Hex,
          result,
          crypto.randomUUID(),
        ),
      ),
    );
    setRecover("");
  }
  const outstanding = entries.some(
    (e) => !["complete", "failed", "rejected"].includes(e.state),
  );
  return (
    <div className={s.bridge}>
      <div className={s.intro}>
        <span className={s.eyebrow}>ARC ↔ BASE · CIRCLE CTS</span>
        <h1>
          Your tokens.
          <br />
          Across chains.
        </h1>
        <p>
          Bridge supported tokens through Circle’s contracts using your own
          connected wallet or Argos Bot Wallet. Find an existing ownerless
          wrapper or set up a new route.
        </p>
      </div>
      <div className={s.grid}>
        <section className={s.card}>
          <div className={s.heading}>
            <h2>Bridge tokens</h2>
            <span className={s.badge}>
              {mode === "bot" ? "Argos Bot Wallet" : "Connected Wallet"}
            </span>
          </div>
          <div
            className={s.walletModes}
            role="group"
            aria-label="Wallet source"
          >
            <button
              disabled={busy}
              aria-pressed={mode === "connected"}
              onClick={() => {
                invalidate();
                setMode("connected");
              }}
            >
              Connected Wallet
            </button>
            <button
              disabled={busy}
              aria-pressed={mode === "bot"}
              onClick={() => {
                invalidate();
                setMode("bot");
              }}
            >
              Argos Bot Wallet
            </button>
          </div>
          <p className={s.note}>
            Arc → Base transfers are marked complete after Base finality, which
            typically takes around 20 minutes after the destination transaction.
            Tokens may appear in your wallet sooner. Timing can vary.
          </p>
          <label>
            Token contract address
            <input
              value={token}
              placeholder="0x… on Arc or Base"
              onChange={(e) => {
                setToken(e.target.value);
                setRoute(undefined);
                setRoutes([]);
                invalidate();
              }}
              spellCheck={false}
            />
          </label>
          <button disabled={busy || !token} onClick={() => work(lookup)}>
            Find token
          </button>
          {uncertain && (
            <p className={s.note}>
              One chain could not be verified. Select a verified result
              explicitly; an address alone cannot always identify its chain.
            </p>
          )}
          {routes.map((r) => (
            <button
              className={s.choice}
              key={r.source}
              aria-pressed={route?.source === r.source}
              onClick={() => {
                setRoute(r);
                invalidate();
              }}
            >
              {r.symbol} on {chains[r.source].name} →{" "}
              {chains[r.destination].name}
            </button>
          ))}
          {route && (
            <>
              <div className={s.route}>
                <strong>{route.name}</strong>
                <p>
                  {chains[route.source].name} → {chains[route.destination].name}
                </p>
                <a
                  href={explorer(route.source, "address", route.token)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source token ↗
                </a>
                {route.counterpart && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={explorer(
                        route.destination,
                        "address",
                        route.counterpart,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wrapped/original token ↗
                    </a>
                  </>
                )}
              </div>
              {!route.compatible ? (
                <p className={s.note}>{route.reason}</p>
              ) : route.state !== "ready" ? (
                <div className={s.note}>
                  <h3>Create the bridge</h3>
                  <p>
                    {route.state === "register"
                      ? "1. Register the original token with Circle’s ownerless manager."
                      : "2. Request the ownerless wrapper on the other chain, with paid forwarding."}{" "}
                    Each step is a separate wallet transaction. Bridging tokens
                    comes afterward.
                  </p>
                </div>
              ) : (
                <label>
                  Amount of {route.symbol}
                  <input
                    inputMode="decimal"
                    value={amount}
                    placeholder="0.00"
                    onChange={(e) => {
                      setAmount(e.target.value);
                      invalidate();
                    }}
                  />
                </label>
              )}
              {account && (
                <p className={s.note}>
                  Tokens arrive at this same wallet on{" "}
                  {chains[route.destination].name}. Allowance goes only to the
                  verified Circle token manager.
                </p>
              )}
              <button
                disabled={
                  busy ||
                  !loaded ||
                  !account ||
                  !route.compatible ||
                  outstanding
                }
                onClick={() => work(prepare)}
              >
                {mode === "connected" && network !== route.source
                  ? "Switch to " + chains[route.source].name
                  : "Review " +
                    (route.state === "ready"
                      ? "bridge"
                      : route.state === "register"
                        ? "registration"
                        : "wrapper creation")}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          {busy && <p role="status">Verifying…</p>}
        </section>
        <aside>
          <section className={s.card}>
            <h2>
              {mode === "bot"
                ? "Your Argos Bot Wallet"
                : "Your connected wallet"}
            </h2>
            {mode === "bot" ? (
              account ? (
                <>
                  <p className={s.address}>{account}</p>
                  <p>
                    Use your signed-in Argos Bot Wallet on Arc and Base. Review
                    and confirm each step here.
                  </p>
                  <Link href="/wallet">Open wallet</Link>
                </>
              ) : (
                <>
                  <p>
                    {session?.needsReauth
                      ? "Reconnect your account before moving funds."
                      : "Sign in to use your Argos Bot Wallet."}
                  </p>
                  <Link href="/wallet">Sign in / reconnect</Link>
                </>
              )
            ) : account ? (
              <>
                <p className={s.address}>{account}</p>
                <p>
                  {network === 5042
                    ? "Arc"
                    : network === 8453
                      ? "Base"
                      : "Switch network to continue"}
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    invalidate();
                    setAccount(undefined);
                    setProvider(undefined);
                    provider?.disconnect?.().catch(() => {});
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <p>
                  Choose a wallet to sign each transaction. Your Argos Bot
                  wallet is separate.
                </p>
                {wallets.map((w) => (
                  <button
                    key={w.info.uuid}
                    disabled={busy}
                    onClick={() => work(() => connect(w.provider))}
                  >
                    {w.info.name.slice(0, 60)}
                  </button>
                ))}
                <button
                  disabled={
                    busy || !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
                  }
                  onClick={() => work(walletConnect)}
                >
                  WalletConnect
                </button>
                {!wallets.length && (
                  <p className={s.note}>
                    Open with an EIP-6963 compatible wallet extension, or use
                    WalletConnect when configured.
                  </p>
                )}
              </>
            )}
          </section>
          <section className={s.card}>
            <h3>How this works</h3>
            <p>
              Original tokens are locked in Circle’s token manager. Their
              wrapped version is minted on the other chain. Returning burns the
              wrapper and unlocks the original.
            </p>
            <p>
              Ownerless removes the token manager’s individual owner. Circle’s
              protocol controls and original-token risks still apply. This
              bridge does not create trading liquidity.
            </p>
            <a
              href="https://docs.arc.io/arc/references/contract-addresses"
              target="_blank"
              rel="noreferrer"
            >
              Official infrastructure ↗
            </a>
          </section>
        </aside>
      </div>
      {review && (
        <section className={s.card} aria-label="Transaction review">
          <h2>Review: {review.step.replace("-", " ")}</h2>
          <p>
            {review.intent.amount && review.intent.action === "transfer"
              ? `${review.intent.amount} ${review.route.symbol}`
              : review.route.name}{" "}
            · {chains[review.intent.chain].name}
          </p>
          <p>
            Recipient / refund:{" "}
            <span className={s.address}>{review.intent.account}</span>
          </p>
          <p>
            Circle forwarding: {formatUnits(BigInt(review.circleFee), 18)}{" "}
            {chains[review.intent.chain].nativeCurrency.symbol}
            {review.step.includes("approval") || review.step === "approve"
              ? " (quoted separately after approval)"
              : ""}
          </p>
          <p>
            Network reserve: {formatUnits(BigInt(review.gasBudget), 18)}{" "}
            {chains[review.intent.chain].nativeCurrency.symbol} · unused reserve
            stays in your wallet.
          </p>
          <a
            href={explorer(review.intent.chain, "address", review.to)}
            target="_blank"
            rel="noreferrer"
          >
            Contract receiving this call ↗
          </a>
          <p>
            Review expires at {new Date(review.expiresAt).toLocaleTimeString()}.
            {mode === "bot"
              ? "Confirm below to authorize this exact transaction from your Argos Bot Wallet."
              : "Your connected wallet shows the final transaction."}
          </p>
          <button disabled={busy || outstanding} onClick={() => work(submit)}>
            {mode === "bot"
              ? "Confirm with Argos Bot Wallet"
              : "Confirm in wallet"}
          </button>
          <button disabled={busy} onClick={() => setReview(undefined)}>
            Cancel
          </button>
        </section>
      )}
      <section className={s.card}>
        <h2>Activity & recovery</h2>
        <p>
          History stays in this browser. Keep your source transaction hash.
          Delayed forwarding never requires another source transfer.
        </p>
        {entries.map((e) => (
          <div className={s.activity} key={e.id}>
            <strong>{e.state}</strong>
            <p>{e.message}</p>
            {e.botId && !e.hash && e.state === "unknown" && (
              <>
                <button disabled={busy} onClick={() => work(() => refresh(e))}>
                  Check status
                </button>
                <button
                  disabled={
                    busy ||
                    !session?.authenticated ||
                    session.needsReauth ||
                    !same(
                      session.walletAddress || "",
                      e.prepared?.intent.account || "",
                    )
                  }
                  onClick={() => work(() => retryBot(e))}
                >
                  Retry same confirmed request
                </button>
                <Link href="/wallet">Open wallet recovery</Link>
              </>
            )}
            {e.hash && (
              <>
                <a
                  href={explorer(e.chain, "tx", e.hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source transaction ↗
                </a>
                <button
                  disabled={busy || !!e.supersededBy}
                  onClick={() => work(() => refresh(e))}
                >
                  Check status
                </button>
              </>
            )}
            {e.state === "complete" &&
              e.prepared &&
              e.prepared.step !== "transfer" && (
                <button
                  disabled={busy || outstanding}
                  onClick={() => work(() => continueEntry(e))}
                >
                  Continue with this token
                </button>
              )}
            {e.destinationHash && e.destination && (
              <a
                href={explorer(e.destination, "tx", e.destinationHash)}
                target="_blank"
                rel="noreferrer"
              >
                Destination transaction ↗
              </a>
            )}
          </div>
        ))}
        <p>
          History keeps the latest completed entries and every unresolved
          request, up to 200 entries. Save transaction hashes for older records.
        </p>
        <label>
          Recover a source transaction (including a speed-up or cancellation)
          <select
            value={recoverChain}
            onChange={(e) =>
              setRecoverChain(Number(e.target.value) as BridgeChain)
            }
          >
            <option value={5042}>Arc</option>
            <option value={8453}>Base</option>
          </select>
          <input
            value={recover}
            onChange={(e) => setRecover(e.target.value)}
            placeholder="0x… transaction hash"
          />
        </label>
        <button
          disabled={busy || !loaded || !recover}
          onClick={() => work(importHash)}
        >
          Recover / import
        </button>
      </section>
    </div>
  );
}
