import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    buildSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA || "development",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

