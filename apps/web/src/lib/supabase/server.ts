import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Per-request Supabase client for the server. Used for AUTH ONLY — never to
 * query application tables (that is Prisma's job). Reads the public Supabase
 * URL and anon key; both are safe to ship (deny-all RLS makes the anon key
 * powerless against the database).
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only.
            // The session refresh in proxy.ts handles cookie writes instead.
          }
        },
      },
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}
