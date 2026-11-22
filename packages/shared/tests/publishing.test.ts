import assert from "node:assert/strict";
import { PLATFORM_LIMITS, validatePostContent, postPayloadSchema, QUEUE_NAMES, SOCIAL_PLATFORM_LIST } from "../src";
import { newConnectState, hashConnectState } from "../src/connect-state";

const ok = (r: { ok: boolean }) => r.ok === true;

// limits match what the platforms allow
assert.equal(PLATFORM_LIMITS.instagram.captionMax, 2200);
assert.equal(PLATFORM_LIMITS.linkedin.captionMax, 3000);
assert.equal(PLATFORM_LIMITS.x.captionMax, 280);
assert.equal(PLATFORM_LIMITS.facebook.captionMax, 63206);
assert.equal(PLATFORM_LIMITS.youtube.captionMax, 100);
for (const p of SOCIAL_PLATFORM_LIST) assert.ok(PLATFORM_LIMITS[p], `limits for ${p}`);

// text rules
assert.ok(ok(validatePostContent("linkedin", "Hello", [])));
assert.ok(ok(validatePostContent("x", "a".repeat(280), [])));
const tooLong = validatePostContent("x", "a".repeat(281), []);
assert.equal(tooLong.ok, false);
assert.match((tooLong as { message: string }).message, /280/);
assert.equal((tooLong as { code: string }).code, "PLATFORM_REJECTED");
assert.equal(validatePostContent("linkedin", "   ", []).ok, false, "empty post");

// Instagram needs media
const igText = validatePostContent("instagram", "caption only", []);
assert.equal(igText.ok, false);
assert.equal((igText as { code: string }).code, "MEDIA_INVALID");
assert.ok(ok(validatePostContent("instagram", "with photo", ["image"])));
assert.ok(ok(validatePostContent("instagram", "carousel", ["image", "image", "image"])));
assert.equal(validatePostContent("instagram", "too many", Array(11).fill("image")).ok, false);
assert.equal(validatePostContent("instagram", "pdf not allowed", ["pdf"]).ok, false);

// YouTube needs exactly one video
assert.equal(validatePostContent("youtube", "title", []).ok, false);
assert.equal(validatePostContent("youtube", "title", ["image"]).ok, false);
assert.ok(ok(validatePostContent("youtube", "title", ["video"])));
assert.equal(validatePostContent("youtube", "title", ["video", "video"]).ok, false);

// LinkedIn can carry a PDF document
assert.ok(ok(validatePostContent("linkedin_page", "see attached", ["pdf"])));
// media-only posts are fine where the platform allows (Instagram photo without caption)
assert.ok(ok(validatePostContent("instagram", "", ["image"])));

// queue payload carries only the post id
const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
assert.deepEqual(postPayloadSchema.parse({ postId: id, org_id: "evil", caption: "x" }), { postId: id });
assert.ok(!postPayloadSchema.safeParse({ postId: "nope" }).success);
assert.equal(QUEUE_NAMES.PUBLISH_POST, "publish.post");

// connect state: random, long, only the hash is stored, hashing is deterministic
const a = newConnectState();
const b = newConnectState();
assert.notEqual(a, b);
assert.ok(a.length >= 43, "at least 256 bits");
assert.match(a, /^[A-Za-z0-9_-]+$/, "safe in a URL");
assert.match(hashConnectState(a), /^[0-9a-f]{64}$/);
assert.equal(hashConnectState(a), hashConnectState(a));
assert.notEqual(hashConnectState(a), hashConnectState(b));
assert.notEqual(hashConnectState(a), a, "the stored value is not the secret");

process.stdout.write("✓ publishing tests PASSED\n");
