import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget — render gracefully no-ops when
 * VITE_TURNSTILE_SITE_KEY is not configured. Calls onToken(token) on success.
 */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; theme?: "auto" | "light" | "dark" }) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loadingPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme: "auto",
        callback: (token) => onToken(token),
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* noop */ }
      }
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="my-3 flex justify-center" />;
}

export const TURNSTILE_ENABLED = Boolean(SITE_KEY);
