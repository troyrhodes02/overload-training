# Mobile Codebase Audit — One-Shot Prompt

Paste into Claude Code after Pitch 24 and the web chores are merged into `staging`. This is a read-only audit. It finishes by writing one document.

---

Audit the Overload web codebase to plan its React Native rebuild. Do not change application code, schema, configuration, or data, and do not call Production or any paid service.

Branch from the latest `staging` as `audit/mobile`. Read `CLAUDE.md`, the planning docs, `docs/planning/mobile-roadmap.md`, and each shipped pitch's `spec.md`, then read the code.

Write one document, `docs/planning/mobile-audit.md`, with these sections. Use tables. Be specific: name files, routes, and functions.

## 1. Screens and routes
Every user-facing route and screen: path, purpose, plan placement (Free or Pro capability), the data it reads and writes, its states (loading, empty, error, locked), and the key components. Mark web-only candidates (admin, billing and checkout, public pages) and say why.

## 2. Server logic and API readiness
Every server action and every read or write module: inputs and outputs, whether the business logic lives in a reusable module or inside the action or component, whether it takes the acting account explicitly, where capabilities are enforced, and whether the write is safe to retry. For each, state the extraction work needed before a mobile API route can call it. List the proposed endpoints per mobile slice in `mobile-roadmap.md`.

## 3. Authentication and session
How sign-in, signup, the invite gate, recovery, suspension, and sessions work today. What mobile token authentication, secure storage, and refresh need, and any assumption in the code that ties a request to a browser cookie.

## 4. Shared code candidates
Pure logic with no database or framework dependency that can move to a shared package: types, validation schemas, e1RM and progression rules, constants, tour and release-note data. Also logic that looks shareable but touches the database or server runtime.

## 5. Data model
Owned versus shared models, anything a mobile client needs that is not exposed today, and any model or field whose meaning is not clear from the code.

## 6. Design system to port
Colors, type, spacing, icons, and charts the web uses, the tokens that can be shared, and the components that need a different native pattern (sheets, pickers, tab bar, lists, charts).

## 7. Tests and quality gates
What tests exist, what they cover, the cross-account isolation suite and how to extend it to API endpoints, the CI checks, and the commands to run them. Note any gaps that matter for the mobile API.

## 8. Environments and configuration
The environment variables by environment, how staging and Production stay separated (including the environment identity guards), deployment settings that a repository restructure would affect, and anything that blocks a monorepo layout.

## 9. Rebuild estimate and proposed order
For each feature, a size (S, M, or L) for the native rebuild with the reason, its dependencies, and its risks. Propose any changes to the slice order, splits, or merges in `mobile-roadmap.md`, and recommend whether the plan builder and plan import stay web-only for the beta. Recommend a workspace layout for slice 21a.

## 10. Findings
A short list of bugs, inconsistencies, duplicated rules, or business logic in the wrong place that you noticed. Rank by severity. Do not fix anything.

Do not edit `docs/planning/mobile-roadmap.md`. Propose changes in section 9 instead. Finish with a summary of the five most important findings, the recommended workspace layout, and the PR link if you opened one. Open a PR into `staging` containing only the audit document, and merge it when the checks are green.
