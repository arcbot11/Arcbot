"use client";

import { useEffect } from "react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(reset, 2_000);
    return () => window.clearTimeout(timer);
  }, [reset]);
  return <main className="not-found"><p className="eyebrow">Arctos Bot</p><h1>Page unavailable.</h1><p>Retrying automatically.</p><button className="button button-dark" type="button" onClick={reset}>Retry</button></main>;
}
