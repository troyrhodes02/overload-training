import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Overload",
  description: "A single-user strength training tracker.",
  applicationName: "Overload",
  // icon.png / apple-icon.png / opengraph-image.png in this directory are
  // picked up automatically by Next's file conventions and wired into the
  // favicon, Apple touch icon, and social preview — no manual <link> config.
  openGraph: {
    title: "Overload",
    description: "A single-user strength training tracker.",
    siteName: "Overload",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Browser chrome matches the app surface per color scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
