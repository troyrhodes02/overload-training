import type { ReactNode } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/data/admin/identity";
import { requireAccount } from "@/lib/data/account";
import { getAccountAppearance } from "@/lib/accounts/appearance";
import { AdminShell } from "@/components/admin/admin-shell";

// Reads the auth session and the allowlist at request time.
export const instant = false;

/**
 * The admin area's gate (Admin Center & Feedback, spec §6.1, §10.1; R1,
 * R23). requireAdmin() runs before anything renders — including the title, so
 * a non-admin's not-found response carries no admin metadata — and every
 * page and action under here checks it again on its own.
 */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Admin · Overload" };
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  const appearance = await getAccountAppearance(await requireAccount());
  return <AdminShell appearance={appearance}>{children}</AdminShell>;
}
