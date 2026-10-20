import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_COLORS } from "@/lib/appearance/appearance";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance/boot-script";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Overload",
  description: "A strength training tracker.",
  applicationName: "Overload",
  // icon.png / apple-icon.png / opengraph-image.png in this directory are
  // picked up automatically by Next's file conventions and wired into the
  // favicon, Apple touch icon, and social preview — no manual <link> config.
  openGraph: {
    title: "Overload",
    description: "A strength training tracker.",
    siteName: "Overload",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome matches the app surface per color scheme (System). An
  // explicit Light or Dark choice overrides both (boot script / applier).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* First paint in this device's last appearance (no flash); static,
            no account data — the shell re-applies the stored value. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
