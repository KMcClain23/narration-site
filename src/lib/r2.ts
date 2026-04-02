import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;

if (!accountId) {
  throw new Error("Missing R2_ACCOUNT_ID");
}

if (!accessKeyId) {
  throw new Error("Missing R2_ACCESS_KEY_ID");
}

if (!secretAccessKey) {
  throw new Error("Missing R2_SECRET_ACCESS_KEY");
}

if (!endpoint) {
  throw new Error("Missing R2_ENDPOINT");
}

const demosBucketName = process.env.R2_DEMOS_BUCKET_NAME;
const demosPublicBaseUrl = process.env.R2_DEMOS_PUBLIC_BASE_URL;
const mediaBucketName = process.env.R2_MEDIA_BUCKET_NAME;
const mediaPublicBaseUrl = process.env.R2_MEDIA_PUBLIC_BASE_URL;

if (!demosBucketName) {
  throw new Error("Missing R2_DEMOS_BUCKET_NAME");
}

if (!demosPublicBaseUrl) {
  throw new Error("Missing R2_DEMOS_PUBLIC_BASE_URL");
}

if (!mediaBucketName) {
  throw new Error("Missing R2_MEDIA_BUCKET_NAME");
}

if (!mediaPublicBaseUrl) {
  throw new Error("Missing R2_MEDIA_PUBLIC_BASE_URL");
}

export const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const R2_BUCKETS = {
  demos: {
    name: demosBucketName,
    publicBaseUrl: demosPublicBaseUrl,
  },
  media: {
    name: mediaBucketName,
    publicBaseUrl: mediaPublicBaseUrl,
  },
};

export const R2_PREFIXES = {
  bookCovers: "book-covers/",
  branding: "branding/",
  social: "social/",
} as const;

export function buildR2PublicUrl(bucketPublicBaseUrl: string, objectKey: string) {
  const normalizedBase = bucketPublicBaseUrl.replace(/\/+$/, "");
  const normalizedKey = objectKey.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedKey}`;
}