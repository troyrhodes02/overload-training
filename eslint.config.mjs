import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Multi-User Foundation (spec §9, R8/R9): owned data is reached ONLY through
// the account-scoped layer in src/lib/data. The raw Prisma client and the
// constructors that build a client for an arbitrary account id are off-limits
// to application code; the account comes from requireAccount() alone.
const RAW_DATA_ACCESS = {
  paths: [
    {
      name: "@/lib/db",
      message:
        "Owned data goes through the account-scoped layer: use requireAccount() and account.db (src/lib/data).",
    },
    {
      name: "@/lib/data/operator",
      message:
        "accountFor() is for operator scripts and tests only; application code gets its Account from requireAccount().",
    },
  ],
  patterns: [
    {
      // Any spelling of the raw client module: "@/lib/db", "../db", "./lib/db".
      regex: "(^|/)(lib/)?db$",
      message:
        "Owned data goes through the account-scoped layer: use requireAccount() and account.db (src/lib/data).",
    },
    {
      group: ["@prisma/client"],
      importNames: ["PrismaClient"],
      message:
        "Never construct a Prisma client in application code; the only client is src/lib/db.ts behind src/lib/data.",
    },
    {
      group: ["@/lib/data/account-db"],
      importNames: ["createAccountClient"],
      message:
        "Only src/lib/data builds account-scoped clients; use requireAccount().",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // UI previews are hand-authored static design-handoff artifacts
    // (overload-ui-design skill); they are never imported into the app.
    "docs/previews/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/data/**", "src/lib/db.ts"],
    rules: {
      "no-restricted-imports": ["error", RAW_DATA_ACCESS],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/db$/]",
          message:
            "No dynamic import of the raw client; use requireAccount() and account.db.",
        },
        {
          selector: "NewExpression[callee.name='PrismaClient']",
          message:
            "Never construct a Prisma client in application code (src/lib/db.ts is the only one).",
        },
      ],
    },
  },
]);

export default eslintConfig;
