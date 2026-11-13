import js from "@eslint/js";

// Root ESLint config (Pitch 21a). It covers only the repository-level scripts
// (the workspace boundary check and its tests). Each workspace keeps its own
// config: apps/web/eslint.config.mjs and packages/shared/eslint.config.mjs.
// Run through `npm run lint` (its postlint step), never on the workspaces.
export default [
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        structuredClone: "readonly",
        URL: "readonly",
      },
    },
  },
];
