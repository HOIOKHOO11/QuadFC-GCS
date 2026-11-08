import type { NextConfig } from "next";

// NEXT_OUTPUT=export  → fully static export into out/ (used by the Electron
//                       desktop packaging of the repo's webapp/ folder)
// (default)           → standalone server (platform preview)
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === "export" ? "export" : "standalone",
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
