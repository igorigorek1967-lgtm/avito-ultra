/**
 * src/contexts/AuthContext.tsx
 *
 * Provides authentication state and helpers to the entire Next.js app.
 * Wraps @supabase/supabase-js Auth API with React Context.
 *
 * Usage:
 *   1. Wrap your app in <AuthProvider> (e.g. in app/layout.tsx or _app.tsx)
 *   2. Consume with: const { user, signIn, signUp, signOut } = useAuth();
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types/database";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface SignInCredentials {
  email: string;
  password: string;
}

interface SignUpCredentials extends SignInCredentials {
  fullName?: string;
}

interface AuthResult {
  error: AuthError | Error | null;
}

interface AuthContextValue {
  /** The raw Supabase session object (null when logged out) */
  session: Session | null;
  /** The authenticated Supabase Auth user (null when logged out) */
  user: User | null;
  /** The extended profile row from the `profiles` table */
  profile: Profile | null;
  /** True while the initial session is being resolved */
  loading: boolean;
  /** Sign in with email + password */
  signIn: (credentials: SignInCredentials) => Promise<AuthResult>;
  /** Register a new account and auto-create a profile row */
  signUp: (credentials: SignUpCredentials) => Promise<AuthResult>;
  /** Sign the current user out */
  signOut: () => Promise<AuthResult>;
  /** Refresh the profile from the database */
  refreshProfile: () => Promise<void>;
}

function mapSupabaseAuthError(error: AuthError | Error): Error {
  const rawMessage = (error.message || "").toLowerCase();

  if (rawMessage.includes("invalid api key") || rawMessage.includes("apikey")) {
    return new Error(
      "Ошибка конфигурации Supabase: неверный NEXT_PUBLIC_SUPABASE_ANON_KEY или он не соответствует NEXT_PUBLIC_SUPABASE_URL. Проверьте .env.local и перезапустите сервер."
    );
  }

  if (rawMessage.includes("failed to fetch") || rawMessage.includes("network")) {
    return new Error(
      "Нет соединения с Supabase. Проверьте NEXT_PUBLIC_SUPABASE_URL, интернет и блокировки CORS/Firewall."
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Fetch the extended profile row ──────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[AuthContext] fetchProfile error:", error.message);
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  // ── Bootstrap: resolve existing session on mount ─────────────────────────
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session: existingSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("[AuthContext] getSession error:", error.message);
        }

        if (mounted) {
          setSession(existingSession);
          setUser(existingSession?.user ?? null);

          if (existingSession?.user?.id) {
            await fetchProfile(existingSession.user.id);
          }
        }
      } catch (err) {
        console.error("[AuthContext] bootstrap error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    // ── Subscribe to auth state changes ──────────────────────────────────
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user?.id) {
        await fetchProfile(newSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── signIn ────────────────────────────────────────────────────────────────
  const signIn = useCallback(
    async ({ email, password }: SignInCredentials): Promise<AuthResult> => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          const normalizedError = mapSupabaseAuthError(error);
          console.error("[AuthContext] signIn error:", error.message);
          return { error: normalizedError };
        }

        return { error: null };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[AuthContext] signIn unexpected error:", error.message);
        return { error };
      }
    },
    []
  );

  // ── signUp ────────────────────────────────────────────────────────────────
  const signUp = useCallback(
    async ({
      email,
      password,
      fullName,
    }: SignUpCredentials): Promise<AuthResult> => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName ?? "",
            },
          },
        });

        if (error) {
          const normalizedError = mapSupabaseAuthError(error);
          console.error("[AuthContext] signUp error:", error.message);
          return { error: normalizedError };
        }

        // The `profiles` row is created automatically by the database trigger
        // (see database/schema.sql → handle_new_user).
        // We still upsert here as a safety net in case the trigger is delayed.
        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(
              {
                id: data.user.id,
                email: email.trim().toLowerCase(),
                full_name: fullName ?? null,
              },
              { onConflict: "id" }
            );

          if (profileError) {
            // Non-fatal: the trigger will handle it
            console.warn(
              "[AuthContext] profile upsert warning:",
              profileError.message
            );
          }
        }

        return { error: null };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[AuthContext] signUp unexpected error:", error.message);
        return { error };
      }
    },
    []
  );

  // ── signOut ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async (): Promise<AuthResult> => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("[AuthContext] signOut error:", error.message);
        return { error };
      }

      setSession(null);
      setUser(null);
      setProfile(null);

      return { error: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[AuthContext] signOut unexpected error:", error.message);
      return { error };
    }
  }, []);

  // ── Memoised context value ────────────────────────────────────────────────
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, user, profile, loading, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

/**
 * Access the authentication context.
 * Must be used inside an <AuthProvider> tree.
 *
 * @example
 * const { user, signIn, signOut } = useAuth();
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (ctx === undefined) {
    throw new Error(
      "[useAuth] must be used within an <AuthProvider>.\n" +
        "Wrap your app (e.g. app/layout.tsx) with <AuthProvider>."
    );
  }

  return ctx;
}
