import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.NEXT_PUBLIC_AVITO_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_keys', message: 'AVITO_CLIENT_ID is not configured' },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId') || '';

  const avitoAuthUrl =
    `https://avito.ru/authorization/oauth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&state=${encodeURIComponent(agentId)}` +
    `&redirect_uri=https://omnihub.su`;

  return NextResponse.redirect(avitoAuthUrl);
}
