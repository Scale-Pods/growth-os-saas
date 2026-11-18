/** Only same-site paths: blocks open redirects such as //evil.com, https://evil.com or @evil.com */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (target && target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) return target;
  return fallback;
}
