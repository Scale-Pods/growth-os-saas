import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function databaseReachable(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const database = await databaseReachable();
  return NextResponse.json(
    {
      status: database ? "healthy" : "degraded",
      database,
      buildSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA || "development",
      requestId: (await headers()).get("x-request-id"),
      timestamp: new Date().toISOString(),
    },
    { status: database ? 200 : 503 },
  );
}
