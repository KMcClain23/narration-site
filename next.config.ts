import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Audit Fix: Compress assets to reduce total page size
  compress: true,
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-0274e76b677f47ea8135396e59f3ef10.r2.dev",
        pathname: "/**",
      },
    ],
    // Audit Fix: Long-term caching for R2 assets
    minimumCacheTTL: 31536000, 
  },
};

export default nextConfig;