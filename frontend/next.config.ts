import type { NextConfig } from "next";
const backend = process.env.TWB_BACKEND_URL || "http://127.0.0.1:8000";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: { workerThreads: true, cpus: 1 },
  typescript: { ignoreBuildErrors: process.env.TWB_SKIP_BUILD_TYPECHECK === "1" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default nextConfig;
