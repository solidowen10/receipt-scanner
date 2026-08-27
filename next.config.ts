import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/receipt-scanner",
  assetPrefix: "/receipt-scanner",
  trailingSlash: false,
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
