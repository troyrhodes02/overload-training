import type { NextConfig } from "next";
import { assertDeploymentTarget } from "./src/lib/env/deployment-guard";

// OVE-111: fail a Preview/Development BUILD whose database or Supabase
// variables reference the Production project. Production and local builds are
// unaffected. The error names the variable only, never its value.
assertDeploymentTarget(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Feedback screenshots upload through a server action. Raise the default 1 MB
  // body cap to admit a small set of images; the feedback validation caps the
  // combined payload well under this (and under the host's own 4.5 MB limit).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    agentUpgrade: "security",
  },
  // Pin the workspace root to this project. A stray lockfile in a parent
  // directory would otherwise be inferred as the root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
