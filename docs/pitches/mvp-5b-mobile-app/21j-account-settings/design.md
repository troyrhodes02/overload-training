# Account & Settings — Design Document

**Version:** 1.0 (pipeline run of 2026-11-24)
**Pitch Source:** Overload — Pitch 21j: Account & Settings (`pitch.md` in this folder)
**Focus:** Managing the account from the iPhone: profile, appearance, plan and access, What's New, feedback with a screenshot, help, the data export through the share sheet, and permanent account deletion. All of it is read from or written to the same account services the web uses.
**Client scope:** Mobile (iOS). The web gets no new screen. It gets two server-side corrections that both clients share: the feedback path is moved into a reusable lib function (with a content check on screenshot bytes), and the export serializer is shared. See §14.
**UI preview:** Skipped, because this is a mobile-only pitch. The native visual contract is the Mobile design section (§15), built with `/overload-mobile-ui`. The visual review artifact is the design canvas linked from §15.

---

## 1. Vision

Away from the bar, a lifter occasionally needs to look after the account itself: fix a name, check what their plan includes, see what changed, tell the owner something broke (with a picture), take their records with them, or leave for good. Today the phone sends all of that to the website. 21j answers each one on the phone, with the web's words and the web's rules, and with no purchase path.

**North star:** *the account is the lifter's to manage, and to take or close, from the device in their hand, calmly, with nothing irreversible done by accident.*

## 2. Design principles

### 1. Same account, same answers

Every value on these screens comes from the server the web uses: the profile, the plan and its dates, the release notes and what has been seen, the export file. The phone formats and never decides. If a value isn't available (a plan date with no subscription behind it), the row is absent. It is never a guess.

### 2. Free manages everything

Profile, appearance, What's New, feedback, help, export, plan status, and deletion work the same on Free, trial, Pro, and complimentary. No account screen shows a Pro note or a lock. The plan screen describes the plan and offers nothing to buy.

### 3. Irreversible means deliberate

Deleting the account takes three separate acts: a screen that names what will be destroyed in the lifter's own numbers, the current password, and a final system confirmation. Until the server confirms, nothing on the phone claims the account is gone. After it confirms, nothing private remains on the phone.

### 4. Private by default

A screenshot is attached only by choosing one. It is never captured automatically. Its location data is stripped before upload. An export file exists on the phone only while the share sheet is open. Nothing here posts anywhere the lifter didn't pick.

### 5. One settings list, not a dashboard

More stays one grouped list in a familiar iOS order: you, your plan, the app, help, your data, then sign out. Delete account sits apart at the very end, in destructive text, reachable but never adjacent to a routine row.

## 3. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

On native that system is the shared tokens (`@overload/shared/design/tokens`, `status-colors`) and the 21d–21i components in `apps/mobile/src/ui`. Nothing here adds a color.

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `background` | every screen | |
| `card`, `border` | the account card, `GroupedList` sections, `Surface` blocks | |
| `foreground`, `mutedForeground` | titles and values; footnotes, dates, helper text | |
| `primary` | the one primary button per screen (Save, Send, Export) | |
| `destructive` | Delete account row, the delete button, the destructive alert action, Sign out | never on a routine row |
| `progress` | the verified-email seal (existing, 21d) | not used as decoration |

### State colors

| State | Visual treatment | Usage |
| --- | --- | --- |
| Plan: Free, trial, paid, complimentary, canceling | plain text label from the shared billing copy | no color: a plan is not a status to worry about |
| Plan: payment problem (grace) | the label in `foreground`, explanation in `mutedForeground`, a `Banner` with plain words | the one plan state that asks for action, which happens on the web |
| What's New: new entries (launch sheet only) | none: the sheet itself is the signal | the list shows no unread dots |
| Feedback sent | inline confirmation surface plus a success haptic | not a floating toast |
| Deletion in progress | the button reads "Deleting…", the screen is inert, back is disabled | |

### Typography, spacing, radius

The established scale: `ScreenHeader` on the tab root, the system back header on pushed screens, 16-point gutters, `radius.xl` cards, 44-point minimum rows. Dates use the account's timezone (release-note dates are calendar dates and render as written). Counts in the deletion inventory use tabular figures.

### Appearance

Light, dark, and system already work (21d, account-synced with a per-device first-paint mirror). Every 21j screen uses tokens only and is reviewed in both appearances. The share sheet, the photo picker, and the system alerts follow the app's appearance (the share sheet is handed the resolved scheme).

## 4. Information architecture

```text
Tabs: Today · Plan · History · Goals · More
                                         │
More (tab root, M1) ─────────────────────┘
 ├─ Account card ────────────→ A1 Profile ──→ A2 Time zone
 ├─ Plan ────────────────────→ A3 Plan & access
 ├─ App
 │   ├─ Appearance  (21d, unchanged)
 │   ├─ Exercises   (21h, unchanged)
 │   └─ Gyms        (21h, unchanged)
 ├─ Updates & help
 │   ├─ What's New ──────────→ A4 What's New
 │   ├─ Send feedback ───────→ A6 Send feedback (modal)
 │   └─ Get help ────────────→ A7 Get help ──→ A6, or Mail
 ├─ Your data
 │   └─ Export your data ────→ A8 Export ──→ iOS share sheet
 ├─ Sign out (alert, unchanged)
 ├─ Delete account ──────────→ A9 Delete account ──→ alert ──→ signed-out welcome
 └─ version · Diagnostics (developer builds, unchanged)

App launch (signed in) → A5 What's New sheet, when the server says something significant is unseen
```

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| M1 More | Regrouped. The "Manage account on the web" row is removed, and every row it stood for now has a native destination. |
| A1–A9 | New. |
| Today greeting | Uses the saved first name after a profile save (cache refresh, no new UI). |
| Signed-out welcome | Shows one line after a deletion: "Your account was deleted." |
| Web | No visible change. |

## 6. Screen specifications

Each screen lists its purpose, trigger, content, states, and behavior. The native layouts are in §15.

### M1 More (tab root, changed)

**Purpose.** The one place to manage the account and the app.

**Content, in order:**

1. `ScreenHeader`: eyebrow "Account and settings", title "More".
2. **Account card** (existing card, now pressable with a chevron): full name, `@username · email`, verified seal. Press → A1.
3. **Plan** group: "Plan" row with the short label ("Free", "Pro — trial · 9d", "Pro — complimentary", …). Press → A3.
4. **App** group: Appearance, Exercises, Gyms (unchanged).
5. **Updates & help** group: What's New, Send feedback, Get help.
6. **Your data** group: Export your data.
7. **Sign out** (its own group, destructive text, existing alert).
8. **Delete account** (its own group, destructive text, extra space above it). Press → A9.
9. Footer: `Overload 0.1.0 · Staging`, then Diagnostics (developer builds only).

**States.** While `me` loads, the card shows a skeleton and the Plan value shows "—". Every row still works, because each destination loads on its own. If `me` fails, the card is replaced by a compact `LoadErrorState` with Retry, and the rows stay usable. Pull to refresh reloads `me`.

### A1 Profile (pushed from More)

**Purpose.** See and correct the account's name, username, and time zone.

**Fields:**

| Field | Type | Required | Validation (same rule as the web) |
| --- | --- | --- | --- |
| First name | text, `givenName`, words capitalized | yes | trimmed 1–50 characters: "Enter your first name." / "Use 50 characters or fewer." |
| Last name | text, `familyName` | yes | same rule as first name |
| Username | text, no autocorrect, lowercase on save, a leading "@" dropped | yes, if the account already has one | 3–20 characters, lowercase letters, numbers, and underscores, not reserved. Helper text is the web's `USERNAME_HELP`. Taken → "That username is taken." |
| Time zone | row → A2 | yes | an IANA zone the server accepts |
| Email | read-only row, with the verified seal | — | Footnote: "Your email can't be changed here." |
| Password | read-only footnote | — | "To change your password, sign out and choose Forgot password." |

**Behavior.**
- Values load from the server. Save stays disabled until something changes, and shows "Saving…" while it runs.
- On success: a success haptic, an inline "Saved" note under the button for 4 s, and the account card, the Today greeting, and (when the time zone changed) every date-dependent screen refresh from the server.
- On a validation error, the server's message appears under its field and focus moves to the first bad field. Typed values stay.
- On a network or server failure, a `Banner` reads "Couldn't save. Your changes are still here." Nothing reads "Saved".
- Leaving with unsaved changes: the back gesture raises an alert, "Discard your changes?" with Keep editing and Discard.
- No Delete, Export, or plan content lives on this screen.

**States.** Loading: field-shaped skeletons. Load error: `LoadErrorState` with Retry, and no empty form is ever shown. Unreachable: the same, worded as needing a connection.

### A2 Time zone (pushed from A1)

**Purpose.** Pick the zone that decides what "today" is.

**Content.** An explanation line, "Overload uses this to decide what today is.", then a suggestion row, "This iPhone: America/Chicago", when the device zone differs from the selected one. Below that, a search field and the full list from the server with a check on the current zone. Choosing a zone returns to A1 with the field changed but not yet saved. Saving happens on A1, so one Save covers the whole form, as on the web.

**States.** The list comes with A1's load, so A2 can't open without it. If search finds nothing: "No time zone matches “Chicgo”."

### A3 Plan & access (pushed from More)

**Purpose.** Tell the lifter what plan they have, what it includes, and when that changes, in the web's words. Nothing to buy.

**Content.**
- Title: the full label ("Pro — Monthly", "Pro — trial · 9 days left", "Free", "Pro — cancellation scheduled", "Payment problem", "Pro — complimentary").
- The explanation sentence from the same shared copy the web uses. It carries the renewal or end date only when the server has a real one.
- "What Pro includes" as a short list of the server's plain-word Pro lines, prefixed "Included in your plan" (Pro, trial, complimentary, canceling, grace) or "Pro adds" (Free). Then "Free always includes" with three fixed lines: logging every set, your full history, your data export.
- A footnote with no link: "Plans and billing are managed on the Overload website."
- For grace, a `Banner` above the explanation: "We couldn't take your last payment."

**Never present:** prices, Subscribe, Upgrade, Manage billing, a promo field, a link to pricing or checkout, or a countdown.

**States.** Loading: a skeleton for the label and two lines. Error or unreachable: `LoadErrorState` with Retry. The More row keeps the label from `me` either way.

### A4 What's New (pushed from More)

**Purpose.** Every product update, newest first, as on the web.

**Content.** The subtitle "Every update to Overload, newest first.", then each entry: date (e.g. "Nov 24, 2026"), title (semibold), and body (muted, full text, never truncated). Separators sit between entries. There are no unread dots and no badges: visiting the list changes nothing, as on the web.

**States.** Loading: three entry-shaped skeletons. Empty (a catalog with no entries): "No updates yet. When something changes in Overload, it's listed here." Error: `LoadErrorState`. Pull to refresh.

### A5 What's New sheet (on launch)

**Purpose.** Show significant updates the account hasn't seen, once, as the web's dialog does.

**Trigger.** After sign-in or launch, when `me` reports unseen significant entries and nothing else is on screen (no workout open, no gate). At most once per app launch.

**Content.** A page sheet titled "What's new", with each unseen significant entry (date, title, body) and a "Got it" primary button. Several entries appear together in one sheet, newest first, which is the web's combined presentation.

**Behavior.** Closing the sheet, by "Got it" or a swipe down, marks everything through the newest entry as seen for the account. That moves the same seen point the web uses, so the web won't show it again either. If that save fails, the sheet still closes and the entries simply come back next launch. A brand-new account has no backlog, because the server starts it at "all seen".

### A6 Send feedback (modal, from More or A7)

**Purpose.** Send the owner a bug, idea, or question, optionally with one screenshot.

**Fields:**

| Field | Control | Required | Validation |
| --- | --- | --- | --- |
| What's it about? | `ChipGroup`: Bug · Idea · Question · Other | yes | "Choose what it's about." |
| Message | multiline `TextField`, 6 lines tall, with a counter `0 / 2,000` | yes | trimmed, 1–2,000 characters: "Write a message." / "Keep it under 2,000 characters." |
| Screenshot | "Add a screenshot" row → the iOS photo picker | no | one image. The server also refuses anything it can't read as PNG, JPEG, or WebP, or anything over 3 MB, with the web's messages. |

**Screenshot row states.**
- None: an "Add a screenshot" row with a photo symbol and the footnote "Optional. Screenshots can show your training and account details, so only attach what you're happy to share."
- Chosen: a thumbnail (about 64 × 128 points, aspect kept), "Screenshot attached", and two actions, **Replace** and **Remove**. Tapping the thumbnail opens it full screen to review.
- Preparing: the thumbnail with a small spinner while the image is resized and stripped of its metadata on the phone.
- Can't use it: an inline error, "That image couldn't be attached. Try another.", and the row returns to None.
- Photo access: the system picker needs no library permission. If iOS still refuses, the row reads "Overload can't open your photos. You can allow it in Settings." and offers an "Open Settings" link.

**Behavior.**
- Send stays disabled until a category and a message exist, and shows "Sending…" while it runs. One tap is one submission: repeated taps and automatic retries carry the same request identity, so the owner gets one message.
- On success: a success haptic, and the modal body becomes a confirmation, "Thanks — sent to the owner.", with a Done button. The draft is cleared.
- On a validation error, the message appears under its field. At the daily limit: "You've sent a lot of feedback today. Try again tomorrow." On a network or server failure: "Couldn't send. Your message is still here." The category, message, and screenshot all stay.
- Cancel with a draft: the alert "Discard this feedback?" with Keep editing and Discard. While the app runs, the draft also survives closing the modal by accident.

**Runtime dependency.** The photo picker needs a native module that the installed development build doesn't have. Until a new development build is approved and installed, A6 ships with every behavior above except the Screenshot row, which is absent. See spec RD-9.

### A7 Get help (pushed from More)

**Purpose.** Say where help comes from, and get there.

**Content.**
- One line: "Questions about your account, logging, exports, deletion, or billing? Send a message from Overload, or email the person who runs it."
- **Send feedback** (primary button) → A6, with Question preselected.
- **Email support** (secondary button) → opens Mail with the support address.
- The support address as selectable text under the buttons, so it can still be copied if Mail isn't set up.

**Behavior.** The support address comes from the server, the same value the web's `/support` page shows. If Mail can't be opened, a banner reads "Couldn't open Mail. You can write to support@… from any email app." and the address stays visible. If the server sends no address, the Email row is absent and Send feedback remains. No invented contact detail is ever shown.

### A8 Export your data (pushed from More)

**Purpose.** Save or send a complete copy of the account's records.

**Content.**
- One paragraph: "A complete copy of everything in your account: your profile, plans, every logged workout and set, goals, gyms, custom exercises, cardio, and feedback. It's one JSON file, the same one the website downloads."
- Primary button **Export**.
- A footnote: "The file is made on your iPhone only while you share it, and removed afterwards."

**Behavior.**
- Tap Export → "Preparing…" with a spinner, and the button is disabled. The server builds the export, and the phone checks it is a complete, readable file, then writes `overload-export-YYYY-MM-DD.json` and opens the **iOS share sheet** (Save to Files, AirDrop, Mail, …).
- When the sheet closes, saved or cancelled, the local file is deleted and the screen returns to idle. Cancelling is silent: it is not an error.
- Failure says what happened, and nothing is written locally: "Couldn't prepare your export. Try again." (server), "Overload needs a connection to export." (offline), or "There isn't enough space on this iPhone to prepare the file." (disk).

### A9 Delete account (pushed from More)

**Purpose.** Permanently close the account, knowing exactly what goes.

**Content, top to bottom.**
- Title "Delete your account".
- "This permanently deletes your account and everything in it. It can't be undone."
- An inventory list with only the non-zero rows, in tabular figures: Plans (mesocycles), Logged workouts, Logged sets, Goals, Gyms, Custom exercises, Cardio logs. With nothing to list: "Your account has no training data yet."
- "The shared exercise library isn't affected."
- The billing note, which is always shown and is the web's: "If you have a Pro subscription, it's canceled immediately and you won't be charged again. For questions about a refund, contact support." "Contact support" goes to A7.
- "Before you go, you can export your data." as a link to A8.
- A **Password** field (secure, `password` content type) with the helper "Enter your password to confirm."
- **Delete account permanently** (destructive, full width), disabled until a password is typed.
- **Cancel** (plain) → back to More.

**Behavior.**
1. Tapping the destructive button raises a system alert, "Delete your Overload account?" / "Your training history and everything in your account will be permanently deleted.", with **Cancel** and **Delete**. Cancel changes nothing.
2. Delete → "Deleting…". The screen becomes inert, the back gesture is disabled, and the keyboard is dismissed.
3. Outcomes:
   - **Deleted:** the phone forgets the auth session, clears every cached account screen, draft, and temporary file, and lands on the signed-out welcome with "Your account was deleted." A warning haptic plays.
   - **Wrong password:** "That password isn't right." under the field, which is cleared and refocused. Nothing was deleted.
   - **Too many attempts:** "Too many attempts. Wait a minute and try again."
   - **Subscription couldn't be canceled:** "We couldn't cancel your subscription, so nothing was deleted. Try again, or contact support."
   - **Data deleted, account not closed:** "Your training data was deleted, but closing your account didn't finish. Try again to finish." The inventory reloads, and is now empty.
   - **Other failure:** "Couldn't delete your account. Nothing was deleted. Try again."
   - **No answer (timeout or connection lost mid-request):** "We couldn't confirm whether your account was deleted." with a **Check again** button. Check again asks the server whether the account still exists. If it doesn't, the Deleted outcome follows. If it does, the screen says "Your account is still here. Nothing was deleted." or shows the data-deleted message if the inventory is now empty.
4. On another signed-in device, the next request finds the account gone and that device returns to the signed-out welcome.

**States.** Loading the inventory: row skeletons, with the password field disabled. Inventory load error: `LoadErrorState`. Deletion needs the inventory first, so the lifter sees what goes before they can delete.

## 7. Navigation flows

```text
More → Account card → A1 Profile → Time zone → A2 → back → A1 (changed) → Save → "Saved"
More → Plan → A3 (read-only) → back
More → What's New → A4 → back
Launch (signed in) → me.whatsNew → A5 sheet → Got it / swipe → seen (web too)
More → Send feedback → A6 modal → Send → confirmation → Done → More
More → Get help → A7 → Send feedback → A6 (Question)  |  Email support → Mail
More → Export your data → A8 → Export → share sheet → (Save to Files | cancel) → A8 idle
More → Delete account → A9 → password → Delete account permanently → alert
     → Cancel → A9 (unchanged)
     → Delete → Deleting… → signed-out welcome "Your account was deleted."
A9 billing note "contact support" → A7;  A9 "export your data" → A8
```

A6 is a root-stack modal, like the 21h and 21i create modals, so it can open from A7 or More without changing tabs. Every other screen is pushed on the More stack and keeps the system back header. Deep links into A1–A9 land on More, as the 21d rule does for unknown paths.

## 8. Interaction specifications

- **Keyboards.** Names use the default keyboard with words capitalized. Username uses ASCII with no autocorrect. The message is multiline. The password field is secure, with Return set to Go, which raises the A9 alert like the button does. The time-zone search has autocorrect off.
- **Keep above keyboard.** A1 and A9 scroll the focused field and the primary button above the keyboard. A6 keeps the message and Send visible.
- **Haptics.** Success on Saved and on Sent. Warning after a confirmed deletion. Nothing else.
- **Loading.** Skeletons shaped like content, never spinners in an empty screen. Buttons show their own progress text.
- **Errors.** `describeLoadError` plus `LoadErrorState` for failed loads, and a `Banner` for failed saves. Typed input is never lost. A failed save never reads as success.
- **Destructive.** Only A9 deletes, and only after the inventory, the password, and the system alert. Sign out keeps its existing alert. Discarding a profile edit or a feedback draft asks first.
- **Notifications.** None are floating. Confirmations are inline (A1 "Saved", A6 confirmation) or a screen change (A9).

## 9. Responsive behavior

iPhone portrait only (the app's configuration). Every screen is a vertical scroll, and every action sits in the content, never in a floating bar over the tab bar. It is checked at the smallest supported iPhone width and at the largest Dynamic Type size without clipping: long names and emails wrap, and plan labels wrap.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Where | New / reused | Notes |
| --- | --- | --- | --- |
| `ScreenHeader`, `GroupedList`/`ListRow`, `Surface`, `Banner`, `Button`, `TextField`, `ChipGroup`, `Skeleton`, `LoadErrorState`, `FormScreen` | all | reused | |
| Account card | M1 | reused, now pressable | chevron added |
| `ProfileScreen`, `TimeZoneScreen` | A1, A2 | new | form state lives in a small store shared by the two routes |
| `PlanAccessScreen` | A3 | new | uses `billingCopy` from the server's answer |
| `ReleaseNoteList` / `ReleaseNoteItem` | A4, A5 | new | one item component for both |
| `WhatsNewSheet` | A5 | new | page-sheet modal, opened once per launch |
| `FeedbackScreen`, `ScreenshotAttachment` | A6 | new | the attachment ships with the runtime ticket |
| `HelpScreen` | A7 | new | |
| `ExportScreen` | A8 | new | share sheet via React Native `Share` with a file URL |
| `DeleteAccountScreen` | A9 | new | inventory rows reuse `ListRow` with tabular values |

## 11. Accessibility, privacy, and data sensitivity

- Every row and button has a VoiceOver label. The account card reads "Name, @username, email, email verified, Profile". The inventory reads each row as "Logged sets, 1,240".
- The verified seal and destructive rows don't rely on color: they have text labels and the role "button".
- The time-zone list reads the selected zone as "selected".
- The A5 sheet moves VoiceOver focus to its title. The A9 alert is the system alert.
- **Screenshots:** user-chosen only. The image is re-encoded on the phone, which drops EXIF data including location, before upload. It is stored in the private bucket and seen only by the owner in the web admin inbox. Nothing about the screen, the route, or the device is attached.
- **Export file:** written to the app's cache only for the life of the share sheet, then deleted. Leftovers from an interrupted export are removed at the next launch and before every export. The file holds no tokens or passwords.
- **Deletion:** the password is sent once over TLS, never stored, and never logged. After deletion the phone keeps no account data: no cache, no drafts, no files.
- No screen shows another account's anything. No share affordance exists besides the lifter's own export.

## 12. Out of scope

- **Deferred:** the native onboarding tour (21k) and replaying the tour; the trial-ending notice on native (the web shows it; native shows nothing); sending a verification email from the phone (verification only gates web checkout); editing custom exercises and gyms (OVE-238); TestFlight and store builds (21l); a per-entry platform field on release notes (21l, see spec RD-6).
- **Not in this product, or not in this slice by rule:** any purchase, subscribe, upgrade, promo, or manage-billing action in the app; in-app purchase or StoreKit; changing email; a native password-change flow; admin screens; social login; a support chat; program generation; ads.

## 13. User guidance

- **Tour.** None is warranted: the native tour doesn't exist yet (21k), and the web tour is unchanged because the web has no visible change.
- **Release note.** None in this run. Release-note entries are dated the day a change reaches users, and the iPhone app isn't distributed to anyone until 21l. Announcing native Settings now would announce a capability nobody has. The 21l TestFlight release writes the one consolidated "Overload on iPhone" entry. Spec RD-6 records the authoring rule for client-specific entries.

## 14. Plan placement and client scope

**Plan placement:** Free. No capability gates any 21j screen or endpoint. A3 displays the plan and never unlocks anything.

| Surface | Shared logic (`packages/shared`) | API (`/api/mobile/v1`) | Web UI | Mobile UI | Why |
| --- | --- | --- | --- | --- | --- |
| Profile | `parseProfileInput`, username rules (exist) | read and update the profile | none | A1, A2 | parity, using the web's validation |
| Appearance | exists (21d) | exists (21d) | none | unchanged | already account-synced |
| Plan & access | `billingCopy` (exists) | read-only plan view | none | A3 | mirror only, no purchase |
| What's New | catalog (exists) | the list, and marking seen | none | A4, A5 | one seen point for both clients |
| Feedback | validation and attachment rules (exist), plus byte sniffing | create with a retry key | none (it shares the new server function) | A6 | same inbox |
| Help | — | support address in app config | none | A7 | same address as `/support` |
| Export | the export filename | the export | none (shares the serializer) | A8 | same file |
| Deletion | — | inventory, and delete with password | none | A9 | same module, same Stripe rule |

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d–21i system: `TabScreen`/`ScreenHeader` for M1, the system back header on pushed screens, `GroupedList` sections, `Surface` cards, tokens only, and 16-point gutters. The visual review artifact (M1, A1, A3, A6, A8, and A9 in light and dark, with illustrative data labelled as such) is the design canvas https://claude.ai/artifact/1BtwAnKCZfHsd16Rz1RwKn (spec RD-18). Where it and the layouts below differ, this document wins.

### M1 More — More tab root

```text
┌──────────────────────────────────┐
│ ACCOUNT AND SETTINGS             │
│ More                             │
│ ┌──────────────────────────────┐ │
│ │ Sam Rivera                 › │ │
│ │ @samr · sam@example.com  ✓   │ │
│ └──────────────────────────────┘ │
│ PLAN                             │
│ │ Plan       Pro — trial · 9d › │ │
│ APP                              │
│ │ Appearance          System › │ │
│ │ Exercises                  › │ │
│ │ Gyms                       › │ │
│ UPDATES & HELP                   │
│ │ What's New                 › │ │
│ │ Send feedback              › │ │
│ │ Get help                   › │ │
│ YOUR DATA                        │
│ │ Export your data           › │ │
│                                  │
│ │ Sign out                     │ │   destructive text
│                                  │
│ │ Delete account               │ │   destructive text, own group
│      Overload 0.1.0 · Staging    │
└──────────────────────────────────┘
```

Differs from the web: the web splits these across Settings, Plan & Billing, What's New, and Feedback in its navigation. Native keeps them in one grouped list, which is the iOS Settings idiom.

### A1 Profile — More stack

```text
┌──────────────────────────────────┐
│ ‹ More          Profile          │
│ NAME                             │
│ │ First name   [ Sam          ] │ │
│ │ Last name    [ Rivera       ] │ │
│ USERNAME                         │
│ │ @ [ samr                    ] │ │
│ 3–20 characters: lowercase …     │
│ TIME ZONE                        │
│ │ Time zone   America/Chicago › │ │
│ ACCOUNT                          │
│ │ Email   sam@example.com   ✓   │ │
│ Your email can't be changed here.│
│ To change your password, sign out│
│ and choose Forgot password.      │
│ [            Save            ]   │
└──────────────────────────────────┘
```

### A3 Plan & access — More stack

```text
┌──────────────────────────────────┐
│ ‹ More       Plan & access       │
│ Pro — trial · 9 days left        │
│ You have full Pro during your    │
│ trial. After it ends you move to │
│ Free, with nothing lost.         │
│ INCLUDED IN YOUR PLAN            │
│ │ Progress, hold, and deload … │ │
│ │ Estimated one-rep max trends │ │
│ │ Rep records and the call …   │ │
│ FREE ALWAYS INCLUDES             │
│ │ Logging every set            │ │
│ │ Your full history            │ │
│ │ Your data export             │ │
│ Plans and billing are managed on │
│ the Overload website.            │
└──────────────────────────────────┘
```

### A5 What's New sheet — over anything, at launch

```text
┌──────────────────────────────────┐
│            What's new            │
│ Nov 15, 2026                     │
│ Each workout remembers its own   │
│ weights                          │
│ When an exercise is in more than │
│ one workout, each workout now …  │
│ ──────────────────────────────── │
│ Nov 11, 2026                     │
│ All-time history                 │
│ …                                │
│ [            Got it          ]   │
└──────────────────────────────────┘
```

### A6 Send feedback — root modal

```text
┌──────────────────────────────────┐
│ Cancel     Send feedback         │
│ WHAT'S IT ABOUT?                 │
│ (Bug) (Idea) (Question) (Other)  │
│ MESSAGE                          │
│ ┌──────────────────────────────┐ │
│ │ The rest day shows…          │ │
│ └──────────────────────────────┘ │
│                       42 / 2,000 │
│ SCREENSHOT                       │
│ ┌────┐ Screenshot attached       │
│ │img │ Replace · Remove          │
│ └────┘                           │
│ Optional. Screenshots can show … │
│ [            Send            ]   │
└──────────────────────────────────┘
```

### A8 Export your data — More stack

```text
┌──────────────────────────────────┐
│ ‹ More     Export your data      │
│ A complete copy of everything in │
│ your account: your profile, …    │
│ It's one JSON file, the same one │
│ the website downloads.           │
│ [           Export           ]   │
│ The file is made on your iPhone  │
│ only while you share it, and     │
│ removed afterwards.              │
└──────────────────────────────────┘
        → iOS share sheet (Save to Files, AirDrop, Mail…)
```

### A9 Delete account — More stack

```text
┌──────────────────────────────────┐
│ ‹ More     Delete account        │
│ Delete your account              │
│ This permanently deletes your    │
│ account and everything in it. It │
│ can't be undone.                 │
│ │ Plans (mesocycles)         2 │ │
│ │ Logged workouts           86 │ │
│ │ Logged sets            1,240 │ │
│ │ Goals                      3 │ │
│ │ Gyms                       2 │ │
│ The shared exercise library isn't│
│ affected.                        │
│ If you have a Pro subscription,  │
│ it's canceled immediately …      │
│ contact support.                 │
│ Before you go, export your data. │
│ PASSWORD                         │
│ │ ••••••••                     │ │
│ Enter your password to confirm.  │
│ [ Delete account permanently ]   │  destructive
│            Cancel                │
└──────────────────────────────────┘
   → alert "Delete your Overload account?"  [Cancel] [Delete]
```

Differs from the web: the web confirms with the password alone. Native adds the system alert, because a stray tap on a phone is more likely and the alert is the iOS idiom for an irreversible action. The web also downloads the export, and native shares it instead.
