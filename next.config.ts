import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-bc56b010ab084607b7602e2996358ca5.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pub-0274e76b677f47ea8135396e59f3ef10.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
