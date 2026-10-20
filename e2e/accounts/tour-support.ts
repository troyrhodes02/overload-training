import { expect, type Page } from "@playwright/test";

/**
 * Onboarding Tour helpers shared by the accounts e2e suites. A brand-new
 * account's first page opens the tour by itself (Onboarding Tour spec R5), so
 * suites that sign up an account and test something else dismiss it through
 * the UI first — exactly what a lifter would do.
 */

export const tourCard = (p: Page) => p.locator("[data-tour-card]");

/** Wait for the auto-started tour and close it with Skip tour. */
export async function skipFirstTour(p: Page) {
  const card = tourCard(p);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: /^(Next|Done)$/ })).toBeEnabled(
    { timeout: 20_000 },
  );
  await card.getByRole("button", { name: "Skip tour" }).click();
  await expect(card).toHaveCount(0);
}
