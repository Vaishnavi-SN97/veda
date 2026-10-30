import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Keys live only in the ROOT .env (CLAUDE.md). Load it for the server side (NextAuth, the backend proxy).
// Nothing here is exposed to the browser unless it starts with NEXT_PUBLIC_.
// forceReload: Next has already loaded frontend/ env files; without it this call is silently skipped.
loadEnvConfig(path.resolve(process.cwd(), ".."), process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
