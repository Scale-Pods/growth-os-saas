import assert from "node:assert/strict";
import { isPrivateAddress, fetchPageText, htmlToText, type FetchDeps } from "../src/web-text";

// ---- address classification --------------------------------------------------------------------
for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"]) {
  assert.equal(isPrivateAddress(ip), true, `${ip} must be treated as private`);
}
for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) {
  assert.equal(isPrivateAddress(ip), false, `${ip} is public`);
}

// ---- html to text ------------------------------------------------------------------------------
{
  const t = htmlToText('<html><head><title>Acme</title><style>.x{color:red}</style><script>alert("steal")</script></head><body><h1>Hello&nbsp;World</h1><p>We make   robots &amp; more.</p><!-- hidden --></body></html>');
  assert.ok(t.includes("Hello World") && t.includes("We make robots & more."));
  assert.ok(!t.includes("alert") && !t.includes("color:red") && !t.includes("hidden") && !t.includes("<"), "scripts, styles, comments and tags are removed");
}

// ---- fetching ------------------------------------------------------------------------------------
const publicResolve = async () => ["93.184.216.34"];
function deps(over: Partial<FetchDeps> & { pages?: Record<string, { status: number; headers?: Record<string, string>; body?: string }> }): FetchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve: over.resolve ?? publicResolve,
    fetch:
      over.fetch ??
      (async (url) => {
        calls.push(String(url));
        const page = over.pages?.[String(url)];
        if (!page) throw new Error("unexpected url " + url);
        return new Response(page.body ?? "", { status: page.status, headers: page.headers });
      }),
  };
}

async function main() {
  // a normal page
  {
    const d = deps({ pages: { "https://example.com/": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<p>Acme makes robots.</p>" } } });
    assert.equal(await fetchPageText("https://example.com/", d), "Acme makes robots.");
  }
  // wrong scheme and malformed addresses never reach the network
  for (const bad of ["file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)", "not a url", "http://user:pw@example.com/"]) {
    const d = deps({});
    await assert.rejects(fetchPageText(bad, d), /web address|allowed|not valid/i, bad);
    assert.equal(d.calls.length, 0, "no request for " + bad);
  }
  // a name that resolves to a private address is refused before any request (DNS tricks)
  {
    const d = deps({ resolve: async () => ["10.0.0.7"] });
    await assert.rejects(fetchPageText("https://internal.example/", d), /not allowed|private/i);
    assert.equal(d.calls.length, 0);
  }
  // one private answer among several is enough to refuse
  {
    const d = deps({ resolve: async () => ["93.184.216.34", "127.0.0.1"] });
    await assert.rejects(fetchPageText("https://mixed.example/", d), /not allowed|private/i);
  }
  // literal private IPs and localhost
  for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://localhost:3000/", "http://[::1]/"]) {
    const d = deps({ resolve: async (h) => [h.replace(/^\[|\]$/g, "")] });
    await assert.rejects(fetchPageText(u, d), /not allowed|private/i, u);
    assert.equal(d.calls.length, 0, u);
  }
  // a redirect to a private address is refused (each hop is re-checked)
  {
    const d = deps({
      resolve: async (h) => (h === "evil.example" ? ["10.1.1.1"] : ["93.184.216.34"]),
      pages: { "https://good.example/": { status: 302, headers: { location: "https://evil.example/secret" } } },
    });
    await assert.rejects(fetchPageText("https://good.example/", d), /not allowed|private/i);
    assert.equal(d.calls.length, 1, "the private hop is never requested");
  }
  // redirects are followed (a few), not forever
  {
    const pages: Record<string, { status: number; headers?: Record<string, string>; body?: string }> = {};
    for (let i = 0; i < 10; i++) pages[`https://loop.example/${i}`] = { status: 302, headers: { location: `https://loop.example/${i + 1}` } };
    const d = deps({ pages });
    await assert.rejects(fetchPageText("https://loop.example/0", d), /redirect/i);
    const ok = deps({ pages: { "https://a.example/": { status: 301, headers: { location: "/home" } }, "https://a.example/home": { status: 200, headers: { "content-type": "text/plain" }, body: "arrived" } } });
    assert.equal(await fetchPageText("https://a.example/", ok), "arrived");
  }
  // non-text content and error statuses
  await assert.rejects(fetchPageText("https://x.example/", deps({ pages: { "https://x.example/": { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" } } })), /text|html/i);
  await assert.rejects(fetchPageText("https://x.example/", deps({ pages: { "https://x.example/": { status: 404, headers: { "content-type": "text/html" }, body: "nope" } } })), /404|could not/i);
  // size cap: a huge page is cut, not loaded whole
  {
    const big = "<p>" + "word ".repeat(400_000) + "</p>";
    const text = await fetchPageText("https://big.example/", deps({ pages: { "https://big.example/": { status: 200, headers: { "content-type": "text/html" }, body: big } } }));
    assert.ok(text.length <= 60_000, "text is capped, got " + text.length);
  }
  // network failures become a readable error
  await assert.rejects(fetchPageText("https://down.example/", deps({ fetch: async () => { throw new Error("ECONNRESET 10.0.0.1"); } })), /could not reach/i);

  process.stdout.write("✓ web text tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
