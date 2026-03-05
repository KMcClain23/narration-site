import { S3Client } from "@aws-sdk/client-s3";


const globalForR2 = globalThis as unknown as {
  r2: S3Client | undefined;
};

// Helper to safely get environment variables without crashing the build
const getEnv = (name: string) => process.env[name]?.trim() || "";

const r2ClientConfig = {
  region: "auto",
  endpoint: getEnv("R2_ENDPOINT"),
  credentials: {
    accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
  },
};

// Export the singleton instance
export const r2 =
  globalForR2.r2 ?? new S3Client(r2ClientConfig);

if (process.env.NODE_ENV !== "production") globalForR2.r2 = r2;