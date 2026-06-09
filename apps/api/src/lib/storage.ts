/**
 * Object storage — S3-compatible, pointed at MinIO locally and Cloudflare R2
 * in prod. Only the endpoint + credentials differ between the two; the code is
 * identical.
 *
 * The golden rule: file bytes NEVER stream through the API. Instead the API
 * issues short-lived *presigned URLs* and the browser uploads/downloads
 * directly to/from storage. That keeps the API fast, cheap, and stateless.
 */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

export const s3 = new S3Client({
  region: env.r2.region,
  endpoint: env.r2.endpoint,
  // MinIO needs path-style URLs (bucket in the path). R2 supports both, so we
  // use path-style everywhere and the same setting works in both environments.
  forcePathStyle: env.r2.forcePathStyle,
  credentials: {
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
  },
});

const DEFAULT_EXPIRY_SECONDS = 60 * 5; // 5 minutes

/**
 * A short-lived URL the browser uses to PUT (upload) an object directly to
 * storage. The API returns this after authorising the request.
 */
export function presignUpload(
  key: string,
  contentType: string,
  expiresIn = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  );
}

/**
 * A short-lived URL the browser uses to GET (download) an object directly from
 * storage — e.g. the finished MusicXML.
 */
export function presignDownload(
  key: string,
  expiresIn = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    { expiresIn }
  );
}
