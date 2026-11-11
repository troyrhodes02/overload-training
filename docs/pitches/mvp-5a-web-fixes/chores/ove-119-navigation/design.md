# OVE-119 — Navigation regrouping (design note)

An owner-requested chore, shipped directly to `main` with owner approval. It changes where things sit, not what they do.

## Public pages (signed out)

- **Phones:** the header shows the wordmark and a menu button. The sheet lists Home, Pricing, Changelog, then the server-resolved actions (Sign in, Create an account, or the invite or closed state).
- **Desktop:** Home, Pricing, Changelog sit beside the wordmark, and the actions sit on the right.

## Signed-in app

The ⋮ account menu is removed from the app shell. The desktop sidebar and the phone sheet hold the same lists, in this order:

1. **Training destinations:** Today, Plan, History, Goals, Exercises, Gyms (unchanged order).
2. A divider, then **Account & app**, a collapsible group: Settings, Plan & Billing, What's New, Send feedback, and Admin (allowlisted accounts only). It is open by default, remembers the last choice in the browser, and always opens when the current page is in it.
3. **The account footer:** an initials circle, the name with the username beneath it, and a Sign out button. The circle opens a small card with the signed-in account's own name, username, and email.

Plan & Billing (`/settings/billing`) and What's New (`/settings/whats-new`) become navigation destinations. Their rows are removed from Settings, and their "‹ Settings" back links go. URLs are unchanged, so Stripe return URLs still work. The admin area keeps its own shell.

### Tour steps changed

Decided by `overload-onboarding`. The Settings step no longer points readers to the removed ⋮ menu. The Plan & Billing step keeps its copy, but now anchors on the sidebar item, falling back to the Plan & Billing page heading on a phone.

| # | id | Screen | Targets (first visible wins) | Title | Body |
| - | -- | ------ | ---------------------------- | ----- | ---- |
| 11 | `settings` | Settings `/settings` | Replay tour button | **Settings** | Your name, timezone, and appearance live here, in the Account & app section of the navigation. Come back to replay this tour any time. |
