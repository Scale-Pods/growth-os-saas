import { htmlToText } from "../web-text";
import type { RawMention } from "./pipeline";

const MAX_XML = 1_000_000;
const MAX_ITEMS = 100;

function block(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  for (const m of xml.matchAll(re)) {
    out.push(m[1]!);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function tagText(xml: string, ...names: string[]): string | null {
  for (const n of names) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i").exec(xml);
    if (m) return m[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  }
  return null;
}

function clean(raw: string | null, max: number): string {
  if (!raw) return "";
  // Markup and scripts are removed, known entities decoded, unknown ones left as they are (never expanded).
  return htmlToText(htmlToText(raw)).slice(0, max);
}

function linkOf(item: string): string {
  const plain = tagText(item, "link");
  if (plain && /^\s*https?:\/\//i.test(plain)) return plain.trim();
  // Atom: <link href="..." rel="alternate"/>
  let first = "";
  for (const m of item.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = m[1]!;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    if (/rel\s*=\s*["']alternate["']/i.test(attrs) || !/rel\s*=/.test(attrs)) return href.trim();
    first ||= href.trim();
  }
  return first;
}

function dateOf(item: string): string | null {
  const raw = tagText(item, "pubDate", "published", "updated", "dc:date");
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Read an RSS 2.0 or Atom feed. Tolerant of junk, capped in size, never expands entities, drops items with no title or link. */
export function parseFeed(xml: string, source: string): RawMention[] {
  const text = xml.slice(0, MAX_XML);
  const items = [...block(text, "item"), ...block(text, "entry")].slice(0, MAX_ITEMS);
  const out: RawMention[] = [];
  for (const it of items) {
    const title = clean(tagText(it, "title"), 500);
    const url = linkOf(it);
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const snippet = clean(tagText(it, "description", "summary", "content", "content:encoded"), 2000);
    out.push({ source, title, snippet: snippet || null, url: url.slice(0, 1000), publishedAt: dateOf(it) });
  }
  return out;
}

function safeTerm(raw: string): string {
  // Letters, numbers, spaces, hyphen, apostrophe and dot only: no quotes, colons or ampersands, so user text cannot
  // add search operators or extra parameters.
  return raw.replace(/[^\p{L}\p{N}\s\-'.]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function buildGoogleNewsUrl(w: { keywords: string[]; excludes: string[]; region: string; lookbackHours: number }): string {
  const region = /^[A-Za-z]{2}$/.test(w.region) ? w.region.toUpperCase() : "US";
  const kw = w.keywords.map(safeTerm).filter(Boolean).map((k) => (k.includes(" ") ? `"${k}"` : k));
  const ex = w.excludes.map(safeTerm).filter(Boolean).map((k) => (k.includes(" ") ? `-"${k}"` : `-${k}`));
  const when = w.lookbackHours <= 24 ? `${Math.max(1, Math.round(w.lookbackHours))}h` : `${Math.ceil(w.lookbackHours / 24)}d`;
  const q = [kw.length > 1 ? `(${kw.join(" OR ")})` : kw.join(""), ...ex, `when:${when}`].filter(Boolean).join(" ");
  const u = new URL("https://news.google.com/rss/search");
  u.searchParams.set("q", q);
  u.searchParams.set("hl", `en-${region}`);
  u.searchParams.set("gl", region);
  u.searchParams.set("ceid", `${region}:en`);
  return u.toString();
}
