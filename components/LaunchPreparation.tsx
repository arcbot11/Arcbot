"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWalletSession, type WalletSession } from "./WalletSessionProvider";
import { WalletSignInButton } from "./WalletSignInButton";
import { PersistentNotices, usePersistentNotices } from "./PersistentNotices";
import { ActiveStatus } from "./ActiveStatus";
import { LaunchReview } from "./LaunchReview";
import { parseAllocation } from "@/lib/launches/allocation";
import { currentLaunchPreview, draftForm, emptyLaunchForm, formInput, type LaunchDraft, type LaunchForm } from "@/lib/launches/form";
import styles from "./LaunchPreparation.module.css";

type Write = { action: "create" | "update"; requestId: string; revision?: number; input: ReturnType<typeof formInput> }
  | { action: "prepare" | "cancel"; requestId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function remember(requestId: string | null) {
  const url = new URL(window.location.href);
  if (requestId) url.searchParams.set("draft", requestId); else url.searchParams.delete("draft");
  window.history.replaceState(null, "", url);
}
export function LaunchPreparation() {
  const session = useWalletSession();
  if (!session) return <p role="status">Checking sign-in…</p>;
  if (!session.authenticated || !session.walletAddress || session.needsReauth) return <WalletSignInButton
    className="button" destination="/wallet/launch">Sign in to prepare a token</WalletSignInButton>;
  // A different wallet gets a fresh controller; old async responses cannot cross accounts.
  return <LaunchEditor key={`${session.provider}:${session.walletAddress}`} session={session} />;
}
function LaunchEditor({ session }: { session: WalletSession }) {
  const [form, setForm] = useState<LaunchForm>({ ...emptyLaunchForm });
  const [draft, setDraft] = useState<LaunchDraft | null>(null), [pending, setPending] = useState<Write | null>(null);
  const [busy, setBusy] = useState(""), [now, setNow] = useState(Date.now());
  const request = useRef<AbortController | null>(null), alive = useRef(true);
  const { notices, notify, dismiss } = usePersistentNotices();
  const wallet = session.walletAddress!;
  const walletLabel = session.provider === "telegram" ? "Telegram-linked wallet" : `X-linked wallet${session.username ? ` for @${session.username.replace(/^@/, "")}` : ""}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("draft");
    if (id && uuid.test(id)) void reload(id);
    // Load once per mounted wallet; no automatic RPC simulation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const expires = draft ? Math.min(draft.expiresAt, draft.preview?.expiresAt ?? draft.expiresAt) : undefined;
    setNow(Date.now());
    if (!expires || expires <= Date.now()) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, expires - Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [draft]);
  function accept(next: LaunchDraft) {
    if (next.address.toLowerCase() !== wallet.toLowerCase() || next.executionEnabled !== false) throw Error("Wallet or launch settings changed. Reload this page.");
    setDraft(next); setForm(draftForm(next.input)); setPending(null); setNow(Date.now()); remember(next.requestId);
  }
  async function reload(id = pending?.requestId ?? draft?.requestId) {
    if (!id || request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy("Loading draft");
    try {
      const response = await fetch(`/api/wallet/launches?requestId=${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (!alive.current || controller.signal.aborted) return;
      if (response.status === 404) { setPending(null); setDraft(null); remember(null); notify("Draft not found. Save your settings to create one."); return; }
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Draft could not be loaded.");
      if (!alive.current || controller.signal.aborted) return;
      accept(result); notify("Draft loaded.");
    } catch (e) { if (alive.current && !controller.signal.aborted) notify(e instanceof Error && !/AbortError|TimeoutError/.test(e.name) ? e.message : "Draft could not be loaded. Try again."); }
    finally { if (request.current === controller) request.current = null; if (alive.current) setBusy(""); }
  }
  async function write(body: Write) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setPending(body); remember(body.requestId);
    setBusy(body.action === "prepare" ? "Simulating launch" : body.action === "cancel" ? "Cancelling draft" : "Saving draft");
    try {
      const response = await fetch("/api/wallet/launches", { method: "POST", headers: { "content-type": "application/json", "x-argus-csrf": session.csrfToken ?? "" },
        body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]) });
      const result = await response.json();
      if (!alive.current || controller.signal.aborted) return;
      if (!response.ok) throw Error(result.error ?? "Preparation request failed.");
      accept(result);
      notify(body.action === "prepare" ? "Preparation complete. No transaction was submitted." : body.action === "cancel" ? "Draft cancelled." : "Draft saved.");
    } catch (e) {
      if (alive.current && !controller.signal.aborted) notify(e instanceof Error && !/AbortError|TimeoutError/.test(e.name) ? e.message : "Request timed out. Reload the saved draft or retry the same request. No transaction was submitted.");
    } finally { if (request.current === controller) request.current = null; if (alive.current) setBusy(""); }
  }
  let input: ReturnType<typeof formInput> | null = null, validation = "";
  try { input = formInput(form); } catch (e) { validation = e instanceof Error ? e.message : "Check the token settings."; }
  let allocationError = "", allocationHint = "Unassigned allocation goes to creator.";
  try { const allocation = parseAllocation(form.allocationText); if (allocation.remainderToCreatorBps) allocationHint = `${allocation.remainderToCreatorBps / 100}% unassigned → creator.`; }
  catch (e) { allocationError = e instanceof Error ? e.message : "Clarify the allocation."; }
  const dirty = !draft || !input || JSON.stringify(input) !== JSON.stringify(draft.input);
  const editable = !busy && !pending && draft?.status !== "cancelled" && (!draft || draft.expiresAt > now);
  const validDraft = draft && draft.status !== "cancelled" && draft.expiresAt > now;
  const preview = draft && !dirty ? currentLaunchPreview(draft, now) : null;
  function save(event: FormEvent) {
    event.preventDefault();
    if (!input) { notify(validation); return; }
    if (!editable) return;
    void write(draft ? { action: "update", requestId: draft.requestId, revision: draft.revision, input }
      : { action: "create", requestId: crypto.randomUUID(), input });
  }
  const field = (key: keyof LaunchForm, label: string, placeholder?: string, required = false, maxLength?: number) => <label className={styles.field} key={key}>
    <span>{label}</span><input value={form[key]} required={required} maxLength={maxLength} placeholder={placeholder}
      onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} autoComplete="off" />
  </label>;
  return <div className={styles.grid}>
    <section className={styles.panel}>
      <h2>Token settings</h2><p className={styles.hint}>{walletLabel}</p>
      <form onSubmit={save}>
        <fieldset disabled={!editable} className={styles.fieldset}>
          <div className={styles.row}>{field("name", "Name", "Token name", true, 32)}{field("symbol", "Ticker", "TOKEN", true, 10)}</div>
          {field("imageURI", "Pinned image URI", "ipfs://…", true, 130)}
          <p className={styles.hint}>Preparation accepts an existing IPFS image. Image uploads are not connected yet.</p>
          <label className={styles.field}><span>Description</span><textarea value={form.description} maxLength={280} rows={3}
            onChange={e => setForm(previous => ({ ...previous, description: e.target.value }))} /></label>
          {field("website", "Website (optional)", "https://…", false, 100)}
          <div className={styles.row}>{field("twitter", "X (optional)", "https://x.com/…", false, 100)}{field("telegram", "Telegram (optional)", "https://t.me/…", false, 100)}</div>
          <p className={styles.fixed}>Buy tax 1% · Sell tax 1%</p>
          <label className={styles.field}><span>Fee allocation</span><textarea value={form.allocationText} maxLength={500} rows={3}
            placeholder="Default: all to creator" aria-describedby="launch-allocation-help"
            onChange={e => setForm(previous => ({ ...previous, allocationText: e.target.value }))} /></label>
          <p id="launch-allocation-help" className={styles.hint}>{allocationError || allocationHint}</p>
          <p className={styles.hint}>Example: half creator, rest evenly between burn and holders.</p>
          <p className={styles.hint}>Dividend minimum: 100,000 tokens.</p>
          {field("devBuyUSDC", "Initial creator buy (USDC)", "0")}
          <button type="submit" className="button">{draft ? "Save changes" : "Save draft"}</button>
        </fieldset>
      </form>
      <div className={styles.actions}>
        {validDraft && <button className="button" type="button" disabled={Boolean(busy || pending || dirty)} onClick={() => void write({ action: "prepare", requestId: draft.requestId })}>Prepare simulation</button>}
        {validDraft && <button type="button" disabled={Boolean(busy || pending)} onClick={() => void write({ action: "cancel", requestId: draft.requestId })}>Cancel draft</button>}
        {(draft || pending) && <button type="button" disabled={Boolean(busy)} onClick={() => void reload()}>Reload saved draft</button>}
        {pending && !busy && <button type="button" onClick={() => void write(pending)}>Retry same request</button>}
        {draft && (draft.status === "cancelled" || draft.expiresAt <= now) && <button type="button" disabled={Boolean(busy || pending)} onClick={() => {
          setDraft(null); setForm({ ...emptyLaunchForm }); remember(null); notices.forEach(dismiss);
        }}>New draft</button>}
      </div>
      {draft && dirty && <p className={styles.hint}>Save changes before preparing a new simulation.</p>}
      {draft && draft.expiresAt <= now && <p className={styles.hint}>Draft expired. Create a new draft to continue.</p>}
      {busy && <p role="status"><ActiveStatus text={busy} active /></p>}
      <PersistentNotices notices={notices} dismiss={dismiss} />
    </section>
    {input ? <LaunchReview input={input} wallet={wallet} walletLabel={walletLabel} preview={preview}
      expired={Boolean(draft?.preview && !dirty && !preview)} /> : <section className={styles.panel}><h2>Review token</h2><p className={styles.hint}>Enter the token settings to see the final allocation and launch details.</p></section>}
  </div>;
}
