import { NextResponse } from 'next/server';

export async function GET() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  return NextResponse.json({
    env: {
      openRouterApiKeyConfigured: Boolean(openRouterApiKey && openRouterApiKey.trim()),
    },
  });
}
