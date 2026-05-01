import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_AVITO_CLIENT_ID;

  // If the key is missing — return a JSON error so the client can handle it gracefully
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_keys', message: 'AVITO_CLIENT_ID is not configured' },
      { status: 200 }
    );
  }

  // Build the redirect URI (can be overridden via env)
  const redirectUri =
    process.env.AVITO_REDIRECT_URI ||
    'http://localhost:3000/api/avito/callback';

  // Grab optional agentId from query string and pass it as OAuth state
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId') || '';

  const avitoAuthUrl =
    `https://avito.ru/authorization/oauth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(agentId)}` +
    `&redirect_uri=${encodeURIComponent('https://omnihub.su')}`;

  return NextResponse.redirect(avitoAuthUrl);
}
