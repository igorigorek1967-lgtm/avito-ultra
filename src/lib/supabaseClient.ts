/**
 * src/lib/supabaseClient.ts
 *
 * Singleton Supabase client for use throughout the Next.js application.
 *
 * NOTE: We intentionally do NOT pass the Database generic to createClient here.
 * Passing a custom Database generic with Omit-derived Insert/Update types causes
 * supabase-js v2 to resolve those types as `never` in certain overloads.
 * Instead, we export typed query helpers via src/types/database.ts and cast
 * results there. The client itself remains untyped for maximum compatibility.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// Environment variable validation
// ─────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "[supabaseClient] Missing environment variable: NEXT_PUBLIC_SUPABASE_URL\n" +
      "Add it to your .env.local file."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "[supabaseClient] Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
      "Add it to your .env.local file."
  );
}

// ─────────────────────────────────────────────
// Client options
// ─────────────────────────────────────────────

const clientOptions = {
  auth: {
    /**
     * Persist the session in localStorage so the user stays logged in
     * across page refreshes (browser-side only).
     */
    persistSession: true,
    /**
     * Automatically refresh the JWT before it expires.
     */
    autoRefreshToken: true,
    /**
     * Detect the session from the URL hash after OAuth / magic-link redirects.
     */
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      "x-application-name": "avito-bots",
    },
  },
};

// ─────────────────────────────────────────────
// Singleton instance
// ─────────────────────────────────────────────

/**
 * Supabase client (untyped generic — see module JSDoc for rationale).
 * Import this wherever you need to query the database or call Auth APIs.
 *
 * @example
 * import { supabase } from "@/lib/supabaseClient";
 * const { data, error } = await supabase.from("profiles").select("*");
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any> = createClient(
  supabaseUrl,
  supabaseAnonKey,
  clientOptions
);

// ─────────────────────────────────────────────
// Server-side helper (for API routes / Server Components)
// ─────────────────────────────────────────────

/**
 * Creates a **new** Supabase client instance that uses a user-specific JWT.
 * Use this inside Next.js API routes or Server Components where you have
 * access to the user's access token from the request cookies/headers.
 *
 * @param accessToken - The user's JWT obtained from `session.access_token`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServerClient(accessToken: string): SupabaseClient<any> {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    ...clientOptions,
    global: {
      headers: {
        ...clientOptions.global.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      ...clientOptions.auth,
      persistSession: false, // never persist on the server
    },
  });
}
