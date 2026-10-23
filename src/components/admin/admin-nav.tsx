"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", short: "Overview" },
  { href: "/admin/accounts", label: "Accounts", short: "Accounts" },
  { href: "/admin/feedback", label: "Feedback", short: "Feedback" },
  { href: "/admin/audit", label: "Audit log", short: "Audit" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin sub-navigation (Admin Center & Feedback design doc Screen 2):
 * Overview · Accounts · Feedback · Audit log. A scrollable row of links on a
 * phone, inline in the header from md. Active state uses the rail's accent
 * treatment plus aria-current, never color alone.
 */
export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={cn("overflow-x-auto", className)}>
      <ul className="flex gap-1">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="md:hidden">{item.short}</span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
