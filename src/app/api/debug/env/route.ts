import { NextResponse } from 'next/server';

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const normalizedSupabaseUrl = supabaseUrl?.trim() ?? '';
  const normalizedAnonKey = supabaseAnonKey?.trim() ?? '';

  const anonKeyPrefix = normalizedAnonKey.slice(0, 12);

  return NextResponse.json({
    env: {
      openRouterApiKeyConfigured: Boolean(openRouterApiKey && openRouterApiKey.trim()),
      supabaseUrlConfigured: Boolean(normalizedSupabaseUrl),
      supabaseAnonKeyConfigured: Boolean(normalizedAnonKey),
      supabaseUrlLooksValid: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizedSupabaseUrl),
      supabaseAnonKeyPrefix: anonKeyPrefix,
      supabaseAnonKeyLooksValid:
        normalizedAnonKey.startsWith('eyJ') || normalizedAnonKey.startsWith('sb_publishable_'),
    },
  });
}
