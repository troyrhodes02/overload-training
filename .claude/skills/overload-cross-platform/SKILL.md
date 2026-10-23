---
name: overload-cross-platform
description: >
  Decide and record how an Overload feature behaves across web, iOS, and Android.
  Use when writing the Platform impact section of a design doc or spec, and when
  planning or building anything that touches sign-in sessions, navigation, deep
  links, external redirects, payments, permissions, notifications, location, health
  data, or app lifecycle. Also use when the user says "cross-platform", "iOS",
  "Android", "Capacitor", "native", "platform impact", or "will this work on
  mobile". Classifies each feature as shared, native-specific, or web-only,
  applies the shell-compatibility checklist, and reports honestly what could not
  be verified without a device. Does nothing platform-specific until the iOS
  foundation has shipped.
---

# Overload Cross-Platform

Overload has one backend and one training model. The web app is wrapped in Capacitor shells for iOS and Android, and native capabilities sit behind adapters named by capability. This skill keeps every feature honest about what that means for it, so mobile is never left as a cleanup task.

## Before you start

1. **Check what exists.** Read the iOS Foundation spec, and the Android Foundation spec if it has shipped (`docs/specs/`, matching the roadmap's numbers and slugs). They record how the shell loads the application, where the platform adapters live, how sessions persist, how deep links work, and how builds and device tests are run. Follow them exactly. Do not guess any of it.
2. **If the iOS foundation has not shipped,** classify each feature as web today, note any obvious mobile impact (sessions, redirects, deep links, payments, permissions), and leave it for the foundation to settle. Do not build native stubs or a second code path in anticipation.
3. **Read `CLAUDE.md`**, especially its cross-platform, plan, and admin rules.

## The decision for every feature

Choose one, and give the reason:

- **Shared.** The web UI works unchanged inside the shells. It only has to be responsive and shell-safe.
- **Native-specific.** It needs native code or a platform adapter, per platform.
- **Web-only.** It stays on the website. The admin area is web-only, and no mobile admin UI is built.

Plan placement (Free, or a named Pro capability) is a separate decision, recorded beside this one.

## The shell-compatibility checklist

Go through this for every feature that touches mobile at all:

- **Sign-in and session:** persistence across launches, expiry, and a suspended account.
- **Navigation:** the Android back button, the iOS swipe-back, deep links into the right screen, and links that leave the app (checkout, legal pages), which open in the external browser and never inside the shell's web view.
- **Redirect flows:** email links such as recovery and verification, and checkout returns.
- **Payments:** no purchase flow inside a shell until the billing path for that store is decided. Store rules differ, and the entitlement is platform-neutral.
- **Permissions:** location, notifications, and health data are requested in context, explained, and degrade gracefully when refused.
- **Lifecycle:** backgrounding in the middle of a workout and resuming. Offline use is not supported.
- **Layout and input:** safe areas, the keyboard, numeric entry, and paste.
- **Store requirements:** in-app account deletion, accurate privacy disclosures, and real native value beyond a website wrapper.

## Adapters

A native capability is a function the app asks for (haptics, notifications, location, health), with each platform's implementation behind it and a browser fallback. Callers ask for the capability and handle "unavailable". They never branch on the platform, and the browser never renders a native-only control. A new platform adds implementations. It does not change callers.

## Examples

| Feature | Web | iOS | Android | Why |
| --- | --- | --- | --- | --- |
| Admin Center | Responsive, secure admin UI | None | None | Web-only. The owner operates from a browser. |
| Plans and billing | Hosted checkout and the entitlement state | Same entitlement. Purchase path decided per store. | Same entitlement. Purchase path decided per store. | Billing is platform-neutral. |
| Password recovery | Recovery pages | Deep link back into the app | Deep link back into the app | Needs the deep-link foundation. |
| Plan import | Paste and review | Paste and review | Paste and review | Shared, but check mobile paste behavior. |
| Exercise history | Shared screen | Shared | Shared | Responsive only. |
| Live activity | None | Live Activity | Ongoing notification, or iOS-only | Native-specific. |
| Apple Watch | None | Watch app | Not planned | iOS-only. |

## Recording it

In the design doc, add a Platform impact section: a table of surface, web, iOS, Android, and the reason, using the decisions above. In the spec, state which behavior is shared and which is platform-specific, name the adapter contract for any native capability, and list the tests. Once the iOS foundation exists, a pitch with no platform impact section is incomplete.

## Verifying honestly

Web behavior is verified normally. A check that needs an Xcode or Android Studio build, an emulator, or a real device cannot be run by an unattended run. Report it as unverified, never as passed, and list the exact manual steps a human should run: which build, which device, which screens, and what to look for. Type-checks, unit tests of adapters, and the web build still run and must pass.

## Rules

- One backend and one training model. Never build a second progression engine or separate mobile training records.
- Share UI by default, and use native code only for an actual platform requirement.
- Do not let a new feature silently break sign-in, navigation, or logged-set behavior on a shell.
- If the decision needs an architectural choice the foundation specs have not made, record it as an open question for the controlling pitch, not as a guess.

## In an unattended run

Decide, do not ask. Record the classification and any judgment calls as Resolved Decisions in the spec. If the foundation has not shipped, record that the platform impact is pending and continue as web.