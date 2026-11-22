import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "@growth-os/shared";

export interface ObjectStore {
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** A short-lived link the social provider can fetch (the bucket itself stays private). */
  signedGet(key: string, expiresInSeconds: number): Promise<string>;
}

/** Cloudflare R2 through its S3-compatible API. Credentials come from the environment only. */
export function r2FromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    const missing = () => new AppError("INTERNAL_ERROR", "File storage is not configured yet. Nothing was changed.", 503);
    return {
      async get() {
        throw missing();
      },
      async put() {
        throw missing();
      },
      async signedGet() {
        throw missing();
      },
    };
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return {
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      if (!res.Body) throw new AppError("NOT_FOUND", "The uploaded file could not be found.", 404);
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }));
    },
    async signedGet(key, expiresInSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), { expiresIn: expiresInSeconds });
    },
  };
}
