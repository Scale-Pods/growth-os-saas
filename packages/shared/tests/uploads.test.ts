import assert from "node:assert/strict";
import { validateUploadRequest, buildObjectKey, parseObjectKey, sniffContentType, AppError, UPLOAD_RULES } from "../src";

const MB = 1024 * 1024;
const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof AppError ? e.code : "NOT_APP_ERROR";
  }
};

// valid requests
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "image/png", size: 5 * MB })), null);
assert.equal(code(() => validateUploadRequest({ kind: "post-video", contentType: "video/mp4", size: 150 * MB })), null);
assert.equal(code(() => validateUploadRequest({ kind: "pdf", contentType: "application/pdf", size: 50 * MB })), null);
assert.equal(code(() => validateUploadRequest({ kind: "logo", contentType: "image/webp", size: 1 * MB })), null);

// dangerous or wrong types are refused
for (const ct of ["text/html", "image/svg+xml", "application/javascript", "application/x-msdownload", "text/plain"]) {
  assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: ct, size: 1000 })), "VALIDATION_ERROR", ct);
}
assert.equal(code(() => validateUploadRequest({ kind: "post-video", contentType: "image/png", size: 1000 })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "pdf", contentType: "image/png", size: 1000 })), "VALIDATION_ERROR");
// content-type parameters cannot be used to sneak past the list
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "text/html; x=image/png", size: 1000 })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "IMAGE/PNG", size: 1000 })), null, "case-insensitive");

// size caps: image 20 MB, logo 5 MB, video 200 MB, pdf 100 MB, never empty
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "image/png", size: 21 * MB })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "logo", contentType: "image/png", size: 6 * MB })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "post-video", contentType: "video/mp4", size: 500 * MB })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "pdf", contentType: "application/pdf", size: 101 * MB })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "image/png", size: 0 })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "post-image", contentType: "image/png", size: -5 })), "VALIDATION_ERROR");
assert.equal(code(() => validateUploadRequest({ kind: "nope" as never, contentType: "image/png", size: 10 })), "VALIDATION_ERROR");
assert.equal(UPLOAD_RULES.logo.maxBytes, 5 * MB);

// object keys: org/{org}/brand/{brand}/{kind}/{uuid}.{ext}, unguessable, extension from the type not from the user
const org = "11111111-1111-4111-8111-111111111111";
const brand = "22222222-2222-4222-8222-222222222222";
const key = buildObjectKey({ orgId: org, brandId: brand, kind: "post-image", contentType: "image/jpeg" });
assert.match(key, new RegExp(`^org/${org}/brand/${brand}/post-image/[0-9a-f-]{36}\\.jpg$`));
assert.notEqual(key, buildObjectKey({ orgId: org, brandId: brand, kind: "post-image", contentType: "image/jpeg" }), "random per call");
assert.match(buildObjectKey({ orgId: org, brandId: null, kind: "pdf", contentType: "application/pdf" }), new RegExp(`^org/${org}/brand/none/pdf/`));

// parsing a key back (used by confirm): only keys under the caller's own org are accepted
assert.deepEqual(parseObjectKey(key), { orgId: org, brandId: brand, kind: "post-image" });
assert.equal(parseObjectKey("org/not-a-uuid/brand/x/post-image/a.png"), null);
assert.equal(parseObjectKey(`org/${org}/brand/${brand}/post-image/../../../etc/passwd`), null);
assert.equal(parseObjectKey(`org/${org}/brand/${brand}/evil-kind/${crypto.randomUUID()}.png`), null);
assert.equal(parseObjectKey(`other/${org}/brand/${brand}/post-image/${crypto.randomUUID()}.png`), null);

// sniffing real bytes: the declared type must match the content
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const mp4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const html = new TextEncoder().encode("<html><script>alert(1)</script>");
assert.equal(sniffContentType(png), "image/png");
assert.equal(sniffContentType(jpg), "image/jpeg");
assert.equal(sniffContentType(webp), "image/webp");
assert.equal(sniffContentType(pdf), "application/pdf");
assert.equal(sniffContentType(mp4), "video/mp4");
assert.equal(sniffContentType(html), null, "html is never a valid upload");

console.log("✓ uploads tests PASSED");
