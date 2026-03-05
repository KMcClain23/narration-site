import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Audit Fix: Compresses assets to reduce the total content size
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-0274e76b677f47ea8135396e59f3ef10.r2.dev",
        pathname: "/**",
      },
    ],
    // Audit Fix: Optimizes caching for assets hosted on Cloudflare R2
    minimumCacheTTL: 31536000, 
  },
};

export default nextConfig;