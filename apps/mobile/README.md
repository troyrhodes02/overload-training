# apps/mobile (reserved)

The Expo (React Native) iPhone app arrives in slice **21d — App Shell, Design System & Accounts** (`docs/planning/mobile-roadmap.md`). Until then this folder has no `package.json`, so npm does not treat it as a workspace.

## Rules that already apply

When 21d adds `apps/mobile/package.json`, the root workspace check (`npm test` → `scripts/workspace-boundaries.mjs`) starts enforcing these:

- **B4.** No server modules: no `@prisma/client`, `prisma`, `next`, `server-only`, `@supabase/ssr`, `@overload/web`, `sharp`, `heic-convert`, `pdfjs-dist`, `stripe`, or `@anthropic-ai/sdk`. The app talks only to the versioned mobile API, plus Supabase Auth for its own auth session (CLAUDE.md, mobile rules).
- **B7, React lockstep.** The app pins the **same exact React** as `apps/web`, so the install has one React runtime. Choose the Expo SDK whose React matches the web's, never the other way round. At the time of 21a that is **Expo SDK 58** (`expo ~58.0.24`, `react 19.3.0`, `react-native 0.88.1`). See `docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/spec.md` §10 for the evidence and the remaining device-only checks (Metro on a device, Hermes `Intl`, `expo-doctor`, EAS).
