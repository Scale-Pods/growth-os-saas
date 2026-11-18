"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { reset: (el?: string | HTMLElement) => void };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Cloudflare Turnstile. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set (local development).
 * The widget adds a hidden field named "cf-turnstile-response" to the surrounding form; the server action
 * forwards it to Supabase Auth, which verifies it with Cloudflare. A token can be used once, so the widget
 * resets whenever `resetSignal` changes (e.g. after a failed submit).
 *
 * The script is added with a plain effect (not next/script): it must also load on a hard page load.
 */
export function TurnstileWidget({ resetSignal }: { resetSignal?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [siteKey]);

  const mounted = useRef(false);
  useEffect(() => {
    // Skip the first run (nothing rendered yet) and only reset when a widget actually exists.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (document.querySelector(".cf-turnstile [name='cf-turnstile-response']")) window.turnstile?.reset();
  }, [resetSignal]);

  if (!siteKey) return null;
  return <div className="cf-turnstile" data-sitekey={siteKey} data-theme="auto" />;
}
