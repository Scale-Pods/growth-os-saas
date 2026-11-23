"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";

/** Shows the workspace's credit balance, read from /api/credits (the server decides what the number is). */
export function CreditsPill() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { balance?: number } } | null) => {
        if (!cancelled && typeof j?.data?.balance === "number") setBalance(j.data.balance);
      })
      .catch(() => {
        // The pill is informational. If it cannot load it stays blank rather than showing a wrong number.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 text-primary text-xs font-semibold shadow-sm transition-all hover:border-primary/40 hover:shadow-[0_2px_12px_rgba(var(--accent-green-rgb)/0.2)]"
      title="Credits left in this workspace"
    >
      <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
        <Coins className="w-2.5 h-2.5" />
      </div>
      <span className="font-mono tracking-tight">
        {balance === null ? "— Credits" : `${balance.toLocaleString()} Credits`}
      </span>
    </div>
  );
}
