import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError, PRESIGN_EXPIRES_SECONDS } from "@growth-os/shared";

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new AppError("INTERNAL_ERROR", "Uploads are not set up on this server yet.", 503);
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET_NAME };
}

let client: S3Client | null = null;
function s3() {
  const c = config();
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.R2_ACCESS_KEY_ID, secretAccessKey: c.R2_SECRET_ACCESS_KEY },
  });
  return { client, bucket: c.bucket };
}

/** Short-lived (10 min) PUT URL locked to this exact key, type and size. Never long-lived. */
export async function presignPut(key: string, contentType: string, size: number): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }), {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
}

/** Short-lived GET URL for showing a private object. */
export async function presignGet(key: string, expiresIn = 300): Promise<string> {
  const { client, bucket } = s3();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const { client, bucket } = s3();
  try {
    const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? null };
  } catch (e) {
    if ((e as { name?: string }).name === "NotFound") return null;
    throw e;
  }
}

/** First bytes of an object, to check the real file type. */
export async function readHead(key: string, bytes = 32): Promise<Uint8Array> {
  const { client, bucket } = s3();
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
  return r.Body ? await r.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = s3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
