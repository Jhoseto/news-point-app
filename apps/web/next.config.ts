import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = resolve(import.meta.dirname, "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  transpilePackages: ["@newspoint/db"],
  turbopack: { root: repoRoot },
};

export default nextConfig;
