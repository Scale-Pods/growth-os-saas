import assert from "node:assert/strict";
import {
  normalizeUrl,
  urlHash,
  cosine,
  filterItems,
  relevanceFilter,
  clusterItems,
  matchExisting,
  detectSpike,
  matchRules,
  type RawMention,
} from "../src/alerts/pipeline";
import { parseFeed, buildGoogleNewsUrl } from "../src/alerts/feeds";

const NOW = new Date("2026-12-01T12:00:00.000Z");
const mention = (over: Partial<RawMention> = {}): RawMention => ({ source: "Google News", title: "Title", snippet: "Snippet", url: "https://news.example/a", publishedAt: "2026-12-01T10:00:00.000Z", ...over });

// ---- urls ---------------------------------------------------------------------------------------
assert.equal(normalizeUrl("HTTPS://News.Example.com/a?utm_source=x&id=7&fbclid=abc#frag"), "https://news.example.com/a?id=7");
assert.equal(normalizeUrl("https://news.example.com/a/"), normalizeUrl("https://news.example.com/a"), "a trailing slash is the same page");
assert.equal(urlHash("https://x.example/a?utm_medium=1"), urlHash("https://x.example/a"), "tracking parameters do not change identity");
assert.match(urlHash("https://x.example/a"), /^[0-9a-f]{64}$/);
assert.notEqual(urlHash("https://x.example/a"), urlHash("https://x.example/b"));

// ---- similarity ---------------------------------------------------------------------------------
assert.equal(cosine([1, 0], [1, 0]), 1);
assert.equal(cosine([1, 0], [0, 1]), 0);
assert.ok(Math.abs(cosine([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-9);
assert.equal(cosine([0, 0], [1, 0]), 0, "a zero vector is similar to nothing");
assert.equal(cosine([1], [1, 0]), 0, "mismatched sizes are never similar");

// ---- cheap filters (no AI) --------------------------------------------------------------------
{
  const items = [
    mention({ url: "https://a.example/1", title: "OpenAI image model update" }),
    mention({ url: "https://a.example/1?utm_source=feed", title: "OpenAI image model update (again)" }), // same link, different tracking
    mention({ url: "https://a.example/2", title: "Hiring: jobs at OpenAI" }), // excluded word
    mention({ url: "https://a.example/3", title: "Old news", publishedAt: "2026-11-01T00:00:00.000Z" }), // outside lookback
    mention({ url: "https://a.example/4", title: "Already seen" }),
    mention({ url: "https://a.example/5", title: "No date", publishedAt: null }),
    mention({ url: "", title: "No link at all" }),
  ];
  const seen = new Set([urlHash("https://a.example/4")]);
  const r = filterItems({ items, excludes: ["Jobs"], lookbackHours: 48, now: NOW, seen });
  assert.deepEqual(r.kept.map((m) => m.url), ["https://a.example/1", "https://a.example/5"]);
  assert.deepEqual(r.dropped, { duplicate: 1, seen: 1, excluded: 1, tooOld: 1, noLink: 1 });
  assert.ok(r.kept.every((m) => m.hash.length === 64));
}

// ---- relevance by meaning ------------------------------------------------------------------------
{
  const items = [mention({ url: "https://x.example/1" }), mention({ url: "https://x.example/2" }), mention({ url: "https://x.example/3" })].map((m) => ({ ...m, hash: urlHash(m.url) }));
  const watch = [1, 0];
  const vectors = [[1, 0.1], [0, 1], [0.9, 0.3]];
  const r = relevanceFilter(items, vectors, watch, 0.5);
  assert.deepEqual(r.kept.map((x) => x.item.url), ["https://x.example/1", "https://x.example/3"]);
  assert.equal(r.belowFloor, 1);
  assert.equal(relevanceFilter(items, vectors, watch, 0.999).kept.length, 0);
}

// ---- same story from several outlets collapses to one ----------------------------------------------
{
  const items = ["a", "b", "c", "d"].map((x) => ({ ...mention({ url: `https://${x}.example/story`, title: `Story ${x}`, snippet: x === "c" ? "A much longer snippet with more detail about the story" : "x" }), hash: urlHash(`https://${x}.example/story`) }));
  const vectors = [[1, 0], [0.99, 0.05], [0.98, 0.1], [0, 1]];
  const c = clusterItems(items.map((item, i) => ({ item, vector: vectors[i]! })), 0.9);
  assert.equal(c.length, 2, "three outlets on one story and one different story");
  const story = c.find((x) => x.members.length === 3)!;
  assert.equal(story.sourceCount, 3);
  assert.equal(story.primary.url, "https://c.example/story", "the item with the most detail leads the story");
  assert.equal(c.find((x) => x.members.length === 1)!.sourceCount, 1);
  assert.ok(story.centroid.length === 2);
}
{
  // a story already stored from an earlier run is recognised instead of alerting again
  const existing = [{ id: "e1", embedding: [1, 0] }, { id: "e2", embedding: [0, 1] }];
  assert.equal(matchExisting([0.97, 0.1], existing, 0.9), "e1");
  assert.equal(matchExisting([0.7, 0.7], existing, 0.9), null);
  assert.equal(matchExisting([1, 0], [], 0.9), null);
  assert.equal(matchExisting([1, 0], [{ id: "x", embedding: [] }], 0.9), null, "an event without a stored vector is never matched");
}

// ---- spikes -------------------------------------------------------------------------------------
{
  const s = detectSpike([4, 5, 6, 5, 4, 5, 6], 20);
  assert.equal(s.isSpike, true);
  assert.ok(s.z >= 3 && s.mean > 4.9 && s.mean < 5.2);
  assert.equal(detectSpike([4, 5, 6, 5, 4, 5, 6], 7).isSpike, false, "an ordinary day is not a spike");
  assert.equal(detectSpike([4, 5], 50).isSpike, false, "not enough history to judge");
  assert.equal(detectSpike([0, 0, 0, 0, 0, 0, 0], 2).isSpike, false, "a tiny absolute rise is noise even from zero");
  assert.equal(detectSpike([0, 0, 0, 0, 0, 0, 0], 12).isSpike, true, "a real jump from a flat baseline is caught");
  assert.equal(detectSpike([5, 5, 5, 5, 5, 5, 5], 8).isSpike, false, "flat baseline with a small rise below the minimum jump");
}

// ---- alert rules ----------------------------------------------------------------------------------
{
  const ev = { watchId: "w1", relevance_score: 85, importance: "high" as const, sentiment: "negative" as const };
  const rule = (o: Record<string, unknown> = {}) => ({ id: "r", watch_id: null as string | null, min_relevance: 70, min_importance: "medium" as const, sentiments: [] as string[], enabled: true, ...o });
  assert.equal(matchRules(ev, [rule()]).length, 1);
  assert.equal(matchRules(ev, [rule({ min_relevance: 90 })]).length, 0, "relevance too low");
  assert.equal(matchRules({ ...ev, importance: "low" }, [rule()]).length, 0, "importance too low");
  assert.equal(matchRules(ev, [rule({ min_importance: "high" })]).length, 1);
  assert.equal(matchRules(ev, [rule({ sentiments: ["positive"] })]).length, 0, "wrong sentiment");
  assert.equal(matchRules(ev, [rule({ sentiments: ["negative", "mixed"] })]).length, 1);
  assert.equal(matchRules(ev, [rule({ watch_id: "other" })]).length, 0, "a rule for another watch");
  assert.equal(matchRules(ev, [rule({ watch_id: "w1" })]).length, 1);
  assert.equal(matchRules(ev, [rule({ enabled: false })]).length, 0, "disabled rules never fire");
}

// ---- feeds ----------------------------------------------------------------------------------------
{
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
    <item><title><![CDATA[OpenAI ships a faster image model - The Verge]]></title><link>https://verge.example/a?utm_source=x</link>
      <description><![CDATA[<p>The new model <b>renders</b> in half the time.</p><script>alert(1)</script>]]></description>
      <pubDate>Mon, 01 Dec 2026 10:00:00 GMT</pubDate><source url="https://verge.example">The Verge</source></item>
    <item><title>Second &amp; third</title><link>https://b.example/b</link><description>Plain &lt;text&gt;</description></item>
    <item><title></title><link>https://c.example/c</link></item>
    <item><title>No link</title></item>
  </channel></rss>`;
  const items = parseFeed(rss, "Google News");
  assert.equal(items.length, 2, "items without a title or a link are dropped");
  assert.equal(items[0]!.title, "OpenAI ships a faster image model - The Verge");
  assert.equal(items[0]!.snippet, "The new model renders in half the time.");
  assert.ok(!items[0]!.snippet!.includes("alert") && !items[0]!.snippet!.includes("<"), "markup and scripts are stripped");
  assert.equal(items[0]!.publishedAt, "2026-12-01T10:00:00.000Z");
  assert.equal(items[1]!.title, "Second & third");
  assert.equal(items[1]!.publishedAt, null);
  assert.equal(items[0]!.source, "Google News");

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom post</title><link href="https://atom.example/p" rel="alternate"/><summary>Atom summary</summary><updated>2026-12-01T09:00:00Z</updated></entry></feed>`;
  const a = parseFeed(atom, "RSS");
  assert.equal(a.length, 1);
  assert.equal(a[0]!.url, "https://atom.example/p");
  assert.equal(a[0]!.snippet, "Atom summary");
  assert.equal(a[0]!.publishedAt, "2026-12-01T09:00:00.000Z");

  // hostile input: oversized fields are capped, junk does not crash, entity bombs are not expanded
  const big = `<rss><channel><item><title>${"T".repeat(5000)}</title><link>https://big.example/x</link><description>${"D".repeat(50000)}</description></item></channel></rss>`;
  const b = parseFeed(big, "RSS");
  assert.ok(b[0]!.title.length <= 500 && (b[0]!.snippet ?? "").length <= 2000);
  assert.deepEqual(parseFeed("this is not xml at all", "RSS"), []);
  assert.deepEqual(parseFeed('<!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;&a;&a;</title><link>https://e.example/1</link></item></channel></rss>', "RSS").map((x) => x.title), ["&a;&a;&a;"], "entities are never expanded");
  assert.equal(parseFeed(`<rss><channel>${Array.from({ length: 300 }, (_, i) => `<item><title>t${i}</title><link>https://m.example/${i}</link></item>`).join("")}</channel></rss>`, "RSS").length, 100, "at most 100 items per feed");
}
{
  const url = buildGoogleNewsUrl({ keywords: ["OpenAI", "image model"], excludes: ["jobs"], region: "US", lookbackHours: 48 });
  const u = new URL(url);
  assert.equal(u.hostname, "news.google.com");
  const q = u.searchParams.get("q")!;
  assert.ok(q.includes("OpenAI") && q.includes('"image model"'), "multi-word keywords are quoted: " + q);
  assert.ok(q.includes("OR"), "any keyword may match");
  assert.ok(q.includes("-jobs"), "excluded words are excluded at the source too");
  assert.ok(/when:\d+[hd]/.test(q), "the lookback is passed to Google News");
  assert.equal(u.searchParams.get("gl"), "US");
  // a hostile keyword cannot add search operators or break the address
  const evil = new URL(buildGoogleNewsUrl({ keywords: ["x&q=evil", 'a" OR site:evil.example'], excludes: [], region: "US", lookbackHours: 24 }));
  assert.equal(evil.searchParams.getAll("q").length, 1, "only one query parameter");
  assert.ok(!evil.searchParams.get("q")!.includes("site:evil.example"), "operators from user text are neutralised");
}

process.stdout.write("✓ alerts pipeline tests PASSED\n");
