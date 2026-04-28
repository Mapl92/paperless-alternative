import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [],
  },
  serverExternalPackages: ["sharp", "bcrypt"],
  // Allow uploads up to 100 MB (matches MAX_FILE_SIZE in /api/documents).
  // Without this, middleware truncates request bodies at 10 MB and FormData
  // parsing fails with "Failed to parse body as FormData".
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
