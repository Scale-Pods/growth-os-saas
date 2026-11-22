"use client";

import { useEffect, useRef, useState } from "react";
import type { Job } from "@growth-os/db";
import { createClient } from "@/lib/supabase/client";

/** Realtime is the fast path. While a job is active we also poll every 3 s so the page is right even if Realtime drops. */
const ACTIVE_POLL_MS = 3_000;
const TERMINAL = new Set(["done", "failed", "canceled"]);

/**
 * Watch one job: initial fetch, Realtime updates, and a polling fallback that runs only while the job is
 * queued or running (Realtime can drop; the page must still end up correct). Row-level security applies.
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
        if (data) {
          setJob(data as Job);
          // Nothing more can change once the job has ended.
          if (TERMINAL.has((data as Job).status)) clearInterval(timer);
        }
      }
    }
    const channel = supabase
      .channel(`job:${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (payload) => {
        if (!cancelled) setJob(payload.new as Job);
      })
      .subscribe();

    const timer = setInterval(() => {
      if (!cancelled) void load();
    }, ACTIVE_POLL_MS);
    void load();

    return () => {
      cancelled = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { job, error, finished: job ? TERMINAL.has(job.status) : false };
}
