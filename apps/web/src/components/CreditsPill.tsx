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
      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold"
      title="Credits left in this workspace"
    >
      <Coins className="w-3.5 h-3.5" />
      <span>{balance === null ? "— Credits" : `${balance.toLocaleString()} Credits`}</span>
    </div>
  );
}
