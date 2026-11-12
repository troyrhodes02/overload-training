import tseslint from "typescript-eslint";
import { sharedRestrictedImports } from "../../scripts/workspace-boundaries.mjs";

// @overload/shared is consumed by both the web app and the iPhone app, so it
// holds only pure, platform-independent TypeScript (CLAUDE.md mobile rules;
// mobile-roadmap "Same repository, shared package"; Pitch 21a spec §8.10).
// Prisma, the scoped data layer, entitlements, and gating stay in apps/web.
// The forbidden list is defined once, in the root workspace check
// (scripts/workspace-boundaries.mjs, rule B3), which applies it again to this
// package's manifest and sources on every `npm test`.
export default tseslint.config(...tseslint.configs.recommended, {
  // Package source only; this config file itself is Node tooling.
  files: ["src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
  rules: {
    "no-restricted-imports": ["error", sharedRestrictedImports()],
  },
});
