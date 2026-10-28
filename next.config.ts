import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Feedback screenshots upload through a server action. Raise the default 1 MB
  // body cap to admit a small set of images; the feedback validation caps the
  // combined payload well under this (and under the host's own 4.5 MB limit).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Pin the workspace root to this project. A stray lockfile in a parent
  // directory would otherwise be inferred as the root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
