import { builtinModules } from "node:module";
import tseslint from "typescript-eslint";

// @overload/shared is consumed by both the web app and the iPhone app, so it
// holds only pure, platform-independent TypeScript (CLAUDE.md mobile rules;
// mobile-roadmap "Same repository, shared package"; Pitch 21a spec §8.10).
// Prisma, the scoped data layer, entitlements, and gating stay in apps/web.
// The root workspace check (scripts/workspace-boundaries.mjs, rule B3) applies
// the same list to this package's manifest and sources.
const WEB_ONLY = [
  "sharp",
  "heic-convert",
  "pdfjs-dist",
  "stripe",
  "@anthropic-ai/sdk",
];

const FORBIDDEN = {
  paths: [
    { name: "prisma", message: "Prisma stays in apps/web." },
    { name: "next", message: "Next.js stays in apps/web." },
    {
      name: "react",
      message:
        "Shared code is renderer-free: no React (each client renders for itself).",
    },
    { name: "react-dom", message: "Shared code is renderer-free." },
    { name: "react-native", message: "Shared code is renderer-free." },
    { name: "server-only", message: "Server-only modules stay in apps/web." },
    { name: "@overload/web", message: "Nothing depends on the web app." },
    ...WEB_ONLY.map((name) => ({
      name,
      message: "Node-only and native packages stay in apps/web.",
    })),
    ...builtinModules.map((name) => ({
      name,
      message: "Shared code also runs on Hermes: no Node built-ins.",
    })),
  ],
  patterns: [
    {
      group: [
        "@prisma/*",
        "next/*",
        "react/*",
        "react-dom/*",
        "react-native/*",
      ],
      message:
        "Shared code is pure TypeScript: no Prisma, Next.js, or React modules.",
    },
    {
      group: ["@supabase/*"],
      message: "Supabase is never used from shared code.",
    },
    {
      group: ["node:*"],
      message: "Shared code also runs on Hermes: no Node built-ins.",
    },
    {
      group: ["@/*"],
      message:
        "The @/ alias is the web app's source; shared code cannot import it.",
    },
  ],
};

export default tseslint.config(...tseslint.configs.recommended, {
  // Package source only; this config file itself is Node tooling.
  files: ["src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
  rules: {
    "no-restricted-imports": ["error", FORBIDDEN],
  },
});
