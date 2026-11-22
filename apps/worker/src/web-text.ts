import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@growth-os/shared";

/**
 * Fetching a web page for a customer-supplied address is an SSRF risk: an attacker could point us at our own
 * network or cloud metadata. So: http(s) only, no credentials in the address, the host must resolve ONLY to
 * public addresses (checked on every redirect hop), a few redirects at most, a timeout, and a size cap.
 */

const MAX_REDIRECTS = 4;
const MAX_BYTES = 300_000;
const MAX_TEXT = 50_000;
const TIMEOUT_MS = 10_000;

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateAddress(mapped[1]!);
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }
  if (isIP(v) === 6) {
    return v === "::" || v === "::1" || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("fc") || v.startsWith("fd");
  }
  return true; // not an address we understand: refuse
}

export interface FetchDeps {
  fetch: (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string>; method?: string; body?: string }) => Promise<Response>;
  resolve: (host: string) => Promise<string[]>;
}

export const defaultFetchDeps: FetchDeps = {
  fetch: (url, init) => fetch(url, init),
  resolve: async (host) => (await lookup(host, { all: true })).map((r) => r.address),
};

const refuse = () => new AppError("VALIDATION_ERROR", "That web address is not allowed.", 400);

async function assertPublic(url: URL, d: FetchDeps) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw refuse();
  if (url.username || url.password) throw refuse();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw refuse();
  const addresses = isIP(host) ? [host] : await d.resolve(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw refuse();
}

/** Plain text from HTML: scripts, styles, comments and tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readCapped(res: Response, maxBytes: number = MAX_BYTES): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, maxBytes));
}

interface BodyOptions {
  maxBytes: number;
  /** Substrings of an allowed content-type. */
  types: string[];
  accept: string;
  typeMessage: string;
}

async function fetchBody(address: string, d: FetchDeps, o: BodyOptions): Promise<{ body: string; type: string }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new AppError("VALIDATION_ERROR", "That web address is not valid.", 400);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url, d);
    let res: Response;
    try {
      res = await d.fetch(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "GrowthOS-Analyzer/1.0", accept: o.accept } });
    } catch {
      throw new AppError("PROVIDER_ERROR", "We could not reach that website.", 502);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new AppError("PROVIDER_ERROR", "The website redirected without saying where.", 502);
      try {
        url = new URL(loc, url);
      } catch {
        throw refuse();
      }
      continue;
    }
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `We could not read that website (it answered ${res.status}).`, 502);
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!o.types.some((t) => type.includes(t))) throw new AppError("VALIDATION_ERROR", o.typeMessage, 400);
    return { body: await readCapped(res, o.maxBytes), type };
  }
  throw new AppError("PROVIDER_ERROR", "The website redirected too many times.", 502);
}

export async function fetchPageText(address: string, d: FetchDeps = defaultFetchDeps): Promise<string> {
  const { body, type } = await fetchBody(address, d, { maxBytes: MAX_BYTES, types: ["text/html", "text/plain"], accept: "text/html,text/plain", typeMessage: "That address is not a text or HTML page." });
  const text = type.includes("text/html") ? htmlToText(body) : body.replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_TEXT);
}

/** A feed (RSS or Atom) as raw XML, with the same protections as page fetching. */
export async function fetchRawText(address: string, d: FetchDeps = defaultFetchDeps, maxBytes = 1_000_000): Promise<string> {
  const { body } = await fetchBody(address, d, { maxBytes, types: ["xml", "text/plain", "text/html"], accept: "application/rss+xml,application/atom+xml,application/xml,text/xml", typeMessage: "That address is not an XML feed." });
  return body;
}

/**
 * POST JSON to a customer-supplied address (a Slack or webhook target). https only, public addresses only, and redirects are
 * NOT followed. Returns the outcome instead of throwing for an unreachable or failing endpoint.
 */
export async function safePostJson(address: string, payload: unknown, d: FetchDeps = defaultFetchDeps): Promise<{ ok: boolean; status: number }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new AppError("VALIDATION_ERROR", "That web address is not valid.", 400);
  }
  if (url.protocol !== "https:") throw refuse();
  await assertPublic(url, d);
  try {
    const res = await d.fetch(url.toString(), {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { "content-type": "application/json", "user-agent": "GrowthOS-Alerts/1.0" },
      body: JSON.stringify(payload),
    });
    await res.body?.cancel().catch(() => undefined);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
