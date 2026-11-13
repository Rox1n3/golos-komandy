import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The project folder is the root even if a parent folder has its own package-lock.json.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
