import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-medium">We couldn&apos;t find that page.</p>
      <Link
        href="/"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to Today
      </Link>
    </main>
  );
}
