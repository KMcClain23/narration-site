import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

/**
 * Narrator audio uploads: naming, sniffing, and where the bytes may live.
 *
 * ── THE BUCKET IS GUARDED, AND THIS IS NOT PRECAUTIONARY ───────────────────
 *
 * The R2 token this project holds is scoped to `dmn-site-media` and
 * `narration-demos`, and BOTH ARE WORLD-READABLE — verified, not assumed: a GET
 * with no signature against the media bucket's public base URL returned 200. It
 * also cannot create a bucket (AccessDenied on CreateBucket).
 *
 * Unreleased audiobook audio, some of it on confidential books, must not sit in
 * a bucket anyone can read. So the bucket comes from R2_PICKUPS_BUCKET_NAME and
 * this module REFUSES to resolve it when that is unset or when it names a known
 * public bucket. The feature is inert until Dean creates a private bucket and a
 * token scoped to it — inert being the correct state for an upload endpoint with
 * nowhere safe to put things.
 */

export * from "@/lib/pickup-upload-rules";

/**
 * The bucket, or an explanation of why there isn't one.
 *
 * Returns a string or throws. Callers surface the message as a refusal rather
 * than issuing a URL to somewhere unsafe.
 */
export function pickupsBucket(): string {
  const name = process.env.R2_PICKUPS_BUCKET_NAME?.trim();
  if (!name) {
    throw new Error(
      "R2_PICKUPS_BUCKET_NAME is not set. Uploads are disabled until a PRIVATE " +
        "R2 bucket exists — the buckets this token can reach are public.",
    );
  }
  // The check that matters: not merely "set", but not one of the public ones.
  const publicBuckets = [
    process.env.R2_MEDIA_BUCKET_NAME?.trim(),
    process.env.R2_DEMOS_BUCKET_NAME?.trim(),
  ].filter(Boolean) as string[];
  if (publicBuckets.includes(name)) {
    throw new Error(
      `R2_PICKUPS_BUCKET_NAME points at ${name}, which is world-readable. ` +
        "Narrator audio must not be publicly downloadable.",
    );
  }
  return name;
}

/** A client for the pickups bucket. Separate from lib/r2.ts, which throws on the public-bucket env. */
export function pickupsR2(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}
