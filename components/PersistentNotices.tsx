"use client";
import { useCallback, useState } from "react";

export function usePersistentNotices() {
  const [notices, setNotices] = useState<string[]>([]);
  const notify = useCallback((message: string) => {
    if (message) setNotices(previous => previous.includes(message) ? previous : [...previous, message]);
  }, []);
  const dismiss = (message: string) => setNotices(previous => previous.filter(item => item !== message));
  return { notices, notify, dismiss };
}

export function PersistentNotices({ notices, dismiss }: { notices: string[]; dismiss: (message: string) => void }) {
  return <div aria-live="polite">{notices.map(message => <div className="otc-notice persistent-notice" key={message}>
    <span>{message} {/^Reconnect/.test(message) && <a href="/api/auth/x/start?returnTo=/wallet">Reconnect X</a>}</span>
    <button type="button" className="otc-inline-button" aria-label="Dismiss message" onClick={() => dismiss(message)}>×</button>
  </div>)}</div>;
}
