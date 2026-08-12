import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // File tracing copies postgres-array's package.json but misses its index.js, so
  // the standalone server throws MODULE_NOT_FOUND on the first database query
  // (pg-types requires it at module load). Force the whole package in.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/postgres-array/**/*"],
  },
};

export default nextConfig;
