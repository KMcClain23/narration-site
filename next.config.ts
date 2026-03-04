import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-0274e76b677f47ea8135396e59f3ef10.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;