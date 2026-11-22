import assert from "node:assert/strict";
import { AppError } from "@growth-os/shared";
import { runDigest, type DigestItem, type DigestStore } from "../src/alerts/digest";
import type { RuleRow } from "../src/alerts/run";

const quietLog = { info() {}, warn() {}, error() {} };
const rule = (o: Partial<RuleRow & { org_id: string }> = {}): RuleRow & { org_id: string } => ({
  id: "r1", org_id: "org-1", watch_id: null, min_relevance: 70, min_importance: "medium", sentiments: [], channel: "in_app", target: null, digest: "daily", enabled: true, ...o,
});
const item = (id: string, ruleRow: RuleRow & { org_id: string }, title: string): DigestItem => ({
  deliveryId: id, rule: ruleRow, watchId: "w1", watchName: "OpenAI image models",
  event: { id: `ev-${id}`, title, summary: `${title} summary`, importance: "high", relevance_score: 90, primary_url: `https://x.example/${id}` },
});

function make(items: DigestItem[]) {
  const marks: { id: string; status: string; error?: string }[] = [];
  const notices: { org_id: string; user_id: string; title: string; body?: string | null }[] = [];
  const store: DigestStore = {
    async queued() {
      return items;
    },
    async mark(id, status, error) {
      marks.push({ id, status, error });
    },
    async recipients() {
      return ["u1", "u2"];
    },
    async notify(rows) {
      notices.push(...rows);
    },
  };
  return { store, marks, notices };
}

async function main() {
  // one message per rule, listing every queued story; each delivery is marked sent
  {
    const r = rule();
    const { store, marks, notices } = make([item("d1", r, "Story one"), item("d2", r, "Story two")]);
    const posts: unknown[] = [];
    const out = await runDigest({ store, post: async (_u, b) => (posts.push(b), { ok: true, status: 200 }), log: quietLog }, "daily");
    assert.deepEqual(out, { rules: 1, stories: 2, failed: 0 });
    assert.equal(notices.length, 2, "one in-app digest per recipient, not one per story");
    assert.ok(notices[0]!.title.toLowerCase().includes("daily") && notices[0]!.title.includes("2"));
    assert.ok((notices[0]!.body ?? "").includes("Story one") && (notices[0]!.body ?? "").includes("Story two"));
    assert.deepEqual(marks.map((m) => [m.id, m.status]), [["d1", "sent"], ["d2", "sent"]]);
    assert.equal(posts.length, 0);
  }
  // Slack digest is one post; its failure marks every story failed and is counted
  {
    const r = rule({ id: "r2", channel: "slack", target: "https://hooks.slack.com/services/T/B/x", digest: "weekly" });
    const { store, marks } = make([item("d3", r, "A"), item("d4", r, "B")]);
    const posts: { url: string; body: unknown }[] = [];
    const ok = await runDigest({ store, post: async (url, body) => (posts.push({ url, body }), { ok: true, status: 200 }), log: quietLog }, "weekly");
    assert.equal(posts.length, 1, "one message for the whole digest");
    assert.deepEqual(ok, { rules: 1, stories: 2, failed: 0 });
    assert.match(JSON.stringify(posts[0]!.body), /A.*B/s);

    const bad = make([item("d5", r, "A")]);
    const out = await runDigest({ store: bad.store, post: async () => ({ ok: false, status: 503 }), log: quietLog }, "weekly");
    assert.equal(out.failed, 1);
    assert.equal(bad.marks[0]!.status, "failed");
    assert.match(bad.marks[0]!.error ?? "", /503/);
    // a rejected (private) address is a failed delivery too, with a readable reason
    const priv = make([item("d6", r, "A")]);
    await runDigest({ store: priv.store, post: async () => { throw new AppError("VALIDATION_ERROR", "That web address is not allowed.", 400); }, log: quietLog }, "weekly");
    assert.match(priv.marks[0]!.error ?? "", /not allowed/i);
  }
  // rules are separate messages; an empty queue does nothing
  {
    const a = rule({ id: "ra" });
    const b = rule({ id: "rb", org_id: "org-2" });
    const { store, notices } = make([item("x1", a, "One"), item("x2", b, "Two")]);
    const out = await runDigest({ store, post: async () => ({ ok: true, status: 200 }), log: quietLog }, "daily");
    assert.equal(out.rules, 2);
    assert.equal(new Set(notices.map((n) => n.org_id)).size, 2, "each workspace is told about its own stories only");
    const empty = make([]);
    assert.deepEqual(await runDigest({ store: empty.store, post: async () => ({ ok: true, status: 200 }), log: quietLog }, "daily"), { rules: 0, stories: 0, failed: 0 });
  }

  process.stdout.write("✓ alerts digest tests PASSED\n");
}

main().catch((e) => {
  process.stderr.write(String(e instanceof Error ? e.stack : e) + "\n");
  process.exit(1);
});
