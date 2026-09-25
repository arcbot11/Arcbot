"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatUnits, type Address, type Hex } from "viem";
import {
  chains,
  explorer,
  same,
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
import { blocksNewBridge, bridgeProgressLabel, bridgeStepCopy, canAdvanceBridge } from "@/lib/bridge/flow";
import { POLL_KEY, POLL_INTERVAL, pollBatch, readPollState } from "@/lib/bridge/polling";
import { mergeRecovery, recoverEntry } from "@/lib/bridge/recovery";
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
    signal: !body && (url.includes("hash=") || url.startsWith("/api/wallet/transaction")) ? AbortSignal.timeout(45_000) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(Error(data.error || "Bridge service unavailable."), { status: r.status });
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
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [recoveryHashes, setRecoveryHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    setRiskAcknowledged(false);
  }, [token, route?.source, account, mode]);
  const [busy, setBusy] = useState(false),
    [busyMessage, setBusyMessage] = useState("Verifying…"),
    [statusNotice, setStatusNotice] = useState(""),
    [error, setError] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [loaded, setLoaded] = useState(false);
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
    const sync = (event: StorageEvent) => {
      if (event.key !== KEY && event.key !== null) return;
      try {
        setEntries(readEntries());
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
    setBusyMessage("Verifying…");
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
  async function reverseDirection() {
    if (!route) return;
    invalidate();
    setAmount("");
    if (route.state !== "ready" || !route.counterpart)
      throw Error("Create the official bridge and wrapper before reversing direction.");
    const current = route;
    const version = epoch.current;
    const found = await api(
      "/api/bridge?token=" + encodeURIComponent(current.counterpart!),
    );
    if (version !== epoch.current) return;
    const reverse = (found.candidates as Route[]).find(
      (candidate) =>
        candidate.source === current.destination &&
        candidate.destination === current.source &&
        candidate.state === "ready" &&
        same(candidate.token, current.counterpart!) &&
        candidate.counterpart &&
        candidate.manager &&
        candidate.destinationManager &&
        current.manager &&
        current.destinationManager &&
        same(candidate.counterpart, current.token) &&
        same(candidate.tokenId, current.tokenId) &&
        same(candidate.manager, current.destinationManager) &&
        same(candidate.destinationManager, current.manager),
    );
    if (!reverse)
      throw Error("The reverse bridge could not be verified. The official bridge and wrapper must exist on both chains. Try finding the token again.");
    setToken(reverse.token);
    setRoutes([reverse]);
    setRoute(reverse);
    setUncertain(false);
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
    setBusyMessage("Checking the next transaction and fees…");
    const found = await api("/api/bridge?token=" + encodeURIComponent(route.token));
    if (version !== epoch.current) throw Error("Wallet or form changed. Review again.");
    const fresh = (found.candidates as Route[]).find((r) => r.source === route.source && same(r.token, route.token));
    if (!fresh) throw Error("The token route could not be verified. Try again.");
    setRoute(fresh);
    setRoutes(found.candidates);
    setUncertain(found.uncertain.length > 0);
    if (fresh.state === "ready" && route.state !== "ready") return;
    const p = await api(
      mode === "bot" ? "/api/wallet/bridge" : "/api/bridge",
      {
        operation: "prepare",
        intent: {
          chain: route.source,
          token: route.token,
          ...(mode === "connected" ? { account } : {}),
          amount,
          ...(fresh.state === "ready" ? { riskAcknowledged } : {}),
          action: fresh.state === "ready" ? "transfer" : fresh.state,
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
            (e) => blocksNewBridge(e, p.intent.account, p.intent.chain),
          )
        )
          throw Error("Recover the previous wallet request without a transaction hash before submitting from this wallet and chain.");
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
          setBusyMessage("Processing your confirmed Argos Bot Wallet transaction…");
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
            setBusyMessage("Waiting for confirmation in your connected wallet…");
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
  async function refresh(entry: Entry) {
    const unchanged = (e: Entry) => e.id === entry.id && e.state === entry.state && e.hash === entry.hash && e.message === entry.message && !e.supersededBy;
    if (entry.botId && !entry.hash) {
      const result = await api(
        "/api/wallet/transaction?id=" + encodeURIComponent(entry.botId),
      );
      await updateHistory(() =>
        persist(
          readEntries().map((e) =>
            unchanged(e) ? botResult(e, result) : e,
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
          readEntries().some(unchanged) ? mergeRecovery(
            readEntries(),
            entry.chain,
            entry.hash!,
            result,
            entry.id,
          ) : readEntries(),
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
          unchanged(e) ? { ...e, ...result } : e,
        ),
      ),
    );
  }
  async function recoverCurrent(entry: Entry) {
    const recoveryHash = recoveryHashes[entry.id] || "";
    if (!/^0x[0-9a-fA-F]{64}$/.test(recoveryHash))
      throw Error("Enter the source transaction hash, including a speed-up or cancellation hash.");
    const hash = recoveryHash as Hex;
    const result = await api(`/api/bridge?chain=${entry.chain}&hash=${hash}`);
    await updateHistory(() => persist(recoverEntry(readEntries(), entry.id, hash, result)));
    setRecoveryHashes((old) => ({ ...old, [entry.id]: "" }));
  }
  async function retryBot(entry: Entry) {
    if (!entry.botId || !entry.prepared) return;
    const result = await api(
      "/api/wallet/bridge",
      { operation: "confirm", prepared: entry.prepared },
      session?.csrfToken,
    );
    await updateHistory(() => persist(readEntries().map((e) =>
      e.id === entry.id ? botResult(e, result) : e,
    )));
  }
  // Poll reads only. Never retry a signature or transaction automatically.
  const pollStatus = useRef<() => Promise<void>>(async () => {});
  pollStatus.current = async () => {
    if (locked.current || document.visibilityState === "hidden") return;
    const pending = entries.filter(
      (e) =>
        !e.supersededBy &&
        !["complete", "failed", "rejected", "unsupported"].includes(e.state) &&
        (e.hash ||
          (e.botId &&
            session?.authenticated &&
            !session.needsReauth &&
            same(session.walletAddress || "", e.prepared?.intent.account || ""))),
    );
    if (!pending.length) return;
    if (!navigator.locks) return;
    await navigator.locks.request("argos-bridge-status-poll", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      try {
        const result = await pollBatch(pending, readPollState(localStorage.getItem(POLL_KEY)),
          (state) => localStorage.setItem(POLL_KEY, JSON.stringify(state)), refresh);
        if (result) setStatusNotice(result.failed
          ? "Some status checks could not complete. Retrying in the background; you can continue using the bridge."
          : "Status checked at " + new Date().toLocaleTimeString() + ".");
      } catch {
        setStatusNotice("Automatic status checks are unavailable. Use Check status on a transaction below.");
      }
    });
  };
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => void pollStatus.current(), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [loaded]);
  const outstanding = entries.some((e) => blocksNewBridge(e, account, route?.source));
  const currentEntry = entries.at(-1);
  const advancedEntry = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (busy || outstanding || review || !currentEntry || advancedEntry.current === currentEntry.id ||
      !canAdvanceBridge(currentEntry, { route, account, amount, mode, network, riskAcknowledged })) return;
    advancedEntry.current = currentEntry.id;
    void work(prepare);
  }, [busy, outstanding, review, currentEntry, route, account, amount, mode, network, riskAcknowledged]);
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
          Bridge tokens through Circle’s contracts using your own
          connected wallet or Argos Bot Wallet. Find an existing ownerless
          wrapper or set up a new route.
        </p>
      </div>
      <div className={s.grid}>
        <section className={s.card}>
          <div className={s.heading}>
            <h2>Bridge tokens</h2>
            <span className={s.badge}>
              {mode === "bot" ? "Argos Bot Wallet" : "External Wallet"}
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
              External Wallet
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
            {" "}You will need Base ETH for gas to unwrap tokens back to Arc.
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
                <div className={s.direction}>
                  <span>
                    {chains[route.source].name} → {chains[route.destination].name}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => work(reverseDirection)}
                    aria-label="Reverse bridge direction"
                  >
                    ⇄ Reverse
                  </button>
                </div>
                {(route.state !== "ready" || !route.counterpart) && (
                  <p className={s.note}>
                    Create the official bridge and wrapper first to reverse direction.
                  </p>
                )}
                <p>
                <a
                  href={explorer(route.source, "address", route.token)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source token ({chains[route.source].name}) ↗
                  <span className={s.address} style={{ display: "block" }}>{route.token}</span>
                </a>
                </p>
                {route.counterpart ? (
                  <p>
                    <a
                      href={explorer(
                        route.destination,
                        "address",
                        route.counterpart,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {route.destination === route.origin ? "Original" : "Wrapped"}{" "}
                      token ({chains[route.destination].name}) ↗
                      <span className={s.address} style={{ display: "block" }}>{route.counterpart}</span>
                    </a>
                  </p>
                ) : (
                  <p className={s.note}>
                    Token contract ({chains[route.destination].name}): available after wrapper creation is confirmed.
                  </p>
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
              {route.compatible && route.state === "ready" && (
                <p className={s.note}>
                  First review the amount and fees. If approval is needed, approve
                  the tokens, then use the same button to bridge them. Each transaction
                  requires your confirmation; approval alone does not send tokens.
                </p>
              )}
              {route.compatible && route.state === "ready" && (
                <label className={s.acknowledgement}>
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    disabled={busy}
                    onChange={(e) => {
                      invalidate();
                      setRiskAcknowledged(e.target.checked);
                    }}
                  />
                  <span>
                    I understand that transfer taxes, rebasing, blacklists or token
                    upgrades may affect delivery or prevent redemption. A successful
                    simulation or Circle wrapper does not guarantee token safety
                    or that I can bridge back.
                  </span>
                </label>
              )}
              {review && (
                <section className={`${s.note} ${s.review}`} aria-label="Transaction review">
                  <h3>{bridgeStepCopy(review.step, review.route.symbol, chains[review.route.destination].name).title}</h3>
                  <p>{bridgeStepCopy(review.step, review.route.symbol, chains[review.route.destination].name).description}</p>
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
                      ? "Use the button below to authorize this transaction from your Argos Bot Wallet."
                      : "Your connected wallet shows the final transaction."}
                  </p>
                  <button disabled={busy} onClick={() => setReview(undefined)}>
                    Cancel
                  </button>
                </section>
              )}
              <button
                className={s.primaryAction}
                disabled={
                  busy ||
                  !loaded ||
                  !account ||
                  !route.compatible ||
                  (route.state === "ready" && !riskAcknowledged) ||
                  outstanding
                }
                onClick={() => work(review ? submit : prepare)}
              >
                {outstanding ? "Recover previous wallet request below" : busy ? busyMessage : review
                  ? bridgeStepCopy(review.step, review.route.symbol, chains[review.route.destination].name).button
                  : mode === "connected" && network !== route.source
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
          {busy && <p role="status">{busyMessage}</p>}

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
      <section className={s.card} aria-label="Bridge transactions">
        <h2>Bridge transactions</h2>
        <p>Previous and pending transactions saved in this browser. Destination delivery and finality continue here while you start another bridge.</p>
        {statusNotice && <p role="status">{statusNotice}</p>}
        {!entries.length && <p>No bridge transactions yet.</p>}
          {[...entries].reverse().map((entry) => (
            <div className={s.note} key={entry.id}>
              <h3>{entry.prepared ? `${entry.prepared.route.symbol} · ${entry.prepared.step.replace("-", " ")}` : "Bridge transaction"}</h3>
              <p>{chains[entry.chain].name}{entry.destination ? ` → ${chains[entry.destination].name}` : ""} · {entry.state === "complete" ? "Complete" : entry.state === "failed" || entry.state === "rejected" || entry.state === "unsupported" ? entry.state : bridgeProgressLabel(entry)}</p>
              <p role="status">{entry.message}</p>
              {!["complete", "failed", "rejected", "unsupported"].includes(entry.state) && (
                <>
                  <button disabled={busy || (!entry.hash && !entry.botId)} onClick={() => work(() => refresh(entry))}>
                    Check status
                  </button>
                  {entry.botId && !entry.hash && (
                    <>
                      <button
                        disabled={busy || !session?.authenticated || session.needsReauth || !same(session.walletAddress || "", entry.prepared?.intent.account || "")}
                        onClick={() => work(() => retryBot(entry))}
                      >
                        Recover same bot request
                      </button>
                      <Link href="/wallet">Open wallet recovery</Link>
                    </>
                  )}
                  <details>
                    <summary>Missing hash or replaced transaction?</summary>
                    <p>
                      Enter the original, speed-up or cancellation transaction hash on {chains[entry.chain].name}.
                      Recovery verifies the sender, nonce and finalized receipt. Do not send the tokens again.
                      If no transaction was broadcast and your wallet did not confirm rejection, contact support before clearing browser data.
                    </p>
                    <label>
                      Source transaction hash
                      <input value={recoveryHashes[entry.id] || ""} onChange={(e) => setRecoveryHashes((old) => ({ ...old, [entry.id]: e.target.value }))} placeholder="0x…" spellCheck={false} />
                    </label>
                    <button disabled={busy || !recoveryHashes[entry.id]} onClick={() => work(() => recoverCurrent(entry))}>
                      Recover this transaction
                    </button>
                  </details>
                </>
              )}
              {entry.hash && (
                <a href={explorer(entry.chain, "tx", entry.hash)} target="_blank" rel="noreferrer">
                  Source transaction ↗
                </a>
              )}
              {entry.destinationHash && entry.destination && (
                <p><a href={explorer(entry.destination, "tx", entry.destinationHash)} target="_blank" rel="noreferrer">
                  Destination transaction ↗
                </a></p>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}
