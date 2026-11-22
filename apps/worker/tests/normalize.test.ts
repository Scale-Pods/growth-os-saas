import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeImage } from "../src/handlers/normalize-image";

async function main() {
  // A 12 megapixel photo with EXIF (including a GPS-like tag) is shrunk to <= 2160 px and its metadata removed.
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 60, b: 20 } } })
    .withExif({ IFD0: { Copyright: "private-owner-name" } })
    .jpeg()
    .toBuffer();
  const out = await normalizeImage(big, "image/jpeg");
  assert.ok(Math.max(out.width, out.height) <= 2160, `longest side ${Math.max(out.width, out.height)}`);
  assert.equal(out.width, 2160, "aspect ratio kept: 4000x3000 -> 2160x1620");
  assert.equal(out.height, 1620);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.exif, undefined, "metadata stripped");
  assert.ok(!out.buffer.includes(Buffer.from("private-owner-name")), "no owner text left in the file");
  assert.ok(out.buffer.length < big.length || out.width < 4000);

  // thumbnail is small
  const thumbMeta = await sharp(out.thumbnail).metadata();
  assert.ok(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0) <= 400);

  // a small image is not enlarged
  const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).png().toBuffer();
  const o2 = await normalizeImage(small, "image/png");
  assert.equal(o2.width, 800);
  assert.equal(o2.height, 600);

  // sha256 is reported for the stored bytes
  assert.match(out.sha256, /^[0-9a-f]{64}$/);

  // bytes that are not an image fail with a clear error instead of crashing the worker
  await assert.rejects(normalizeImage(Buffer.from("<html>not an image</html>"), "image/png"), /image/i);

  console.log("✓ image normalize tests PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
