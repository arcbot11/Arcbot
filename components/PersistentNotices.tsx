"use client";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";

export function usePersistentNotices() {
  const [notices, setNotices] = useState<string[]>([]);
  const notify = useCallback((message: string) => {
    if (message) setNotices(previous => previous.length === 1 && previous[0] === message ? previous : [message]);
  }, []);
  const dismiss = (message: string) => setNotices(previous => previous.filter(item => item !== message));
  return { notices, notify, dismiss };
}

export function PersistentNotices({ notices, dismiss, renderMessage }: { notices: string[]; dismiss: (message: string) => void; renderMessage?: (message: string) => ReactNode }) {
  return <div aria-live="polite">{notices.map(message => <div className="otc-notice persistent-notice" key={message}>
    <span>{renderMessage?renderMessage(message):message} {/^Reconnect/.test(message) && <Link href="/wallet/sign-in?returnTo=/wallet">Reconnect</Link>}</span>
    <button type="button" className="otc-inline-button" aria-label="Dismiss message" onClick={() => dismiss(message)}>×</button>
  </div>)}</div>;
}
