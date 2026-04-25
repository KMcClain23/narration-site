import type { NextConfig } from "next";
 
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
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