import type { NextConfig } from "next";

// STATIC_EXPORT=1 → fully static output for GitHub Pages (or any static host),
// with NEXT_PUBLIC_BASE_PATH=/daali-register as the sub-path prefix.
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  ...(isStatic ? { output: "export" as const, images: { unoptimized: true } } : { output: "standalone" }),
  basePath,
  // keep static-export artifacts away from the running dev server's .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
