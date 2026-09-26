"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, opts: any) => string; remove: (id: string) => void } }
}

// Widget Turnstile. Se NEXT_PUBLIC_TURNSTILE_SITEKEY non è impostato, non
// renderizza nulla e la verifica server-side resta disattivata.
export default function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!sitekey) return;
    const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const render = () => {
      if (!ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey,
        callback: (t: string) => onToken(t),
        "error-callback": () => onToken(""),
        "expired-callback": () => onToken(""),
      });
    };
    if (window.turnstile) { render(); return; }
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = render;
    document.head.appendChild(s);
    return () => { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current); widgetId.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitekey]);

  if (!sitekey) return null;
  return <div ref={ref} className="my-1" />;
}
