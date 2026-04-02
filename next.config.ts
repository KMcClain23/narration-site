import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-bc56b010ab084607b7602e2996358ca5.r2.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;