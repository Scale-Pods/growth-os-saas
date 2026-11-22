"use client";

import { useEffect, useRef, useState } from "react";
import type { Job } from "@growth-os/db";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 30_000;
const TERMINAL = new Set(["done", "failed", "canceled"]);

/**
 * Watch one job: initial fetch, Realtime updates, and a 30-second polling fallback
 * (Realtime can drop; the page must still end up correct). Row-level security applies.
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    const supabase = (supabaseRef.current ??= createClient());
    let cancelled = false;

    async function load() {
      const { data, error: e } = await supabase.from("jobs").select("*").eq("id", jobId!).maybeSingle();
      if (cancelled) return;
      if (e) setError("Could not load job status.");
      else {
        setError(null);
        if (data) setJob(data as Job);
      }
    }
    void load();

    const channel = supabase
      .channel(`job:${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (payload) => {
        if (!cancelled) setJob(payload.new as Job);
      })
      .subscribe();

    const timer = setInterval(() => {
      if (!cancelled) void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, error, finished: job ? TERMINAL.has(job.status) : false };
}
