import type { NextConfig } from "next";

// better-sqlite3 is a native Node module used server-side only.
// Externalizing it keeps webpack from trying to bundle .node binaries.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["100.121.26.118"],
};

export default nextConfig;
