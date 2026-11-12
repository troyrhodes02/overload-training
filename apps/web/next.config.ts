import path from "node:path";
import type { NextConfig } from "next";
import { assertDeploymentTarget } from "./src/lib/env/deployment-guard";

// OVE-111: fail a Preview/Development BUILD whose database or Supabase
// variables reference the Production project. Production and local builds are
// unaffected. The error names the variable only, never its value.
assertDeploymentTarget(process.env);

// Pitch 21a: this app lives in apps/web of an npm workspace. The workspace root
// (two levels up, where the single package-lock.json is) holds the hoisted
// node_modules, `next` included. Turbopack resolves modules only inside its
// root, and file tracing must use the same root, so both are pinned to it.
// Pinning it explicitly also stops a stray lockfile in a parent directory from
// being inferred as the root.
const WORKSPACE_ROOT = path.join(__dirname, "..", "..");

// Where npm placed pdfjs-dist (hoisted to the workspace root today), relative
// to this project, because tracing includes resolve from the project root.
const PDFJS_DIR = path
  .relative(__dirname, path.dirname(require.resolve("pdfjs-dist/package.json")))
  .split(path.sep)
  .join("/");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Plan-import image normalization (OVE-108) runs server-only in
  // src/lib/import/storage.ts. `sharp` ships a native binary and `heic-convert`
  // pulls a WASM libheif; both must be treated as external server packages so
  // Next never attempts to bundle them for the client. storage.ts is
  // `server-only`, so verify:client-bundle stays green regardless.
  serverExternalPackages: ["sharp", "heic-convert"],
  // src/lib/import/pdf.ts loads pdfjs-dist through a runtime-built import() (the
  // legacy build is ESM-only and must dodge the CommonJS test transform), which
  // Vercel's file tracer cannot see. Without this the package is missing from
  // the deployed function and every PDF upload fails before it is even opened.
  // The path is resolved (PDFJS_DIR), not assumed to be ./node_modules, because
  // npm workspaces hoist the package; a wrong path would fail silently and only
  // in the deployed function (mobile audit Q-2).
  outputFileTracingRoot: WORKSPACE_ROOT,
  outputFileTracingIncludes: {
    "/plan/import": [
      `${PDFJS_DIR}/package.json`,
      `${PDFJS_DIR}/legacy/build/**/*`,
    ],
  },
  // Feedback screenshots upload through a server action. Raise the default 1 MB
  // body cap to admit a small set of images; the feedback validation caps the
  // combined payload well under this (and under the host's own 4.5 MB limit).
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    agentUpgrade: "security",
  },
  // The npm workspace root (see WORKSPACE_ROOT); must equal
  // outputFileTracingRoot.
  turbopack: {
    root: WORKSPACE_ROOT,
  },
};

export default nextConfig;
