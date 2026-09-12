"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { WalletSignIn } from "./WalletSignIn";

export function WalletSignInButton({ className, children, destination = "/wallet", align = "left" }: {
  className?: string; children: ReactNode; destination?: string; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId(), root = useRef<HTMLSpanElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  function close(restoreFocus = false) { setOpen(false); if (restoreFocus) trigger.current?.focus(); }
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) setOpen(false); };
    window.addEventListener("argos-signin-open", other);
    return () => window.removeEventListener("argos-signin-open", other);
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const popup = panel.current;
      if (!popup) return;
      popup.style.transform = "";
      if (window.getComputedStyle(popup).position !== "absolute") return;
      const bounds = popup.getBoundingClientRect();
      const shift = Math.max(16 - bounds.left, Math.min(0, window.innerWidth - 16 - bounds.right));
      if (shift) popup.style.transform = `translateX(${shift}px)`;
    };
    position();
    window.addEventListener("resize", position);
    panel.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", escape);
    const element = root.current;
    return () => { window.removeEventListener("resize", position); document.removeEventListener("pointerdown", outside); element?.removeEventListener("keydown", escape); };
  }, [open]);
  return <span className={`wallet-signin-anchor wallet-signin-${align}`} ref={root}>
    <button ref={trigger} className={className} type="button" aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onClick={() => {
      if (!open) window.dispatchEvent(new CustomEvent("argos-signin-open", { detail: id }));
      setOpen(!open);
    }}>{children}</button>
    {open && <div id={id} className="wallet-signin-popover" role="dialog" aria-label="Sign in to wallet" tabIndex={-1} ref={panel}>
      <div className="wallet-signin-heading"><strong>Sign In to Wallet</strong><button type="button" aria-label="Close sign-in" onClick={() => close(true)}>×</button></div>
      <WalletSignIn destination={destination} />
    </div>}
  </span>;
}
