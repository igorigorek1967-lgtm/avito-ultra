import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Guard: API key must be set server-side
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set in environment variables.');
    return NextResponse.json(
      { error: 'Сервер не настроен: отсутствует OPENROUTER_API_KEY. Добавьте ключ в .env.local' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { messages, systemPrompt } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Неверный формат сообщений' }, { status: 400 });
    }

    // System prompt goes first, then the conversation history
    const formattedMessages = [
      { role: 'system', content: systemPrompt || 'Ты — полезный ИИ-ассистент.' },
      ...messages,
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // Required by OpenRouter to identify the app
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://omnihub.su',
        'X-Title': 'OmniHub',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: formattedMessages,
      }),
    });

    // Handle specific auth errors from OpenRouter
    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text().catch(() => '');
      console.error('OpenRouter auth error:', response.status, errorText);
      return NextResponse.json(
        {
          error: `Ошибка авторизации OpenRouter (${response.status}): API-ключ недействителен или истёк. Проверьте OPENROUTER_API_KEY в .env.local`,
          details: errorText,
        },
        { status: 401 }
      );
    }

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Превышен лимит запросов OpenRouter. Попробуйте через несколько секунд.' },
        { status: 429 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Ошибка от OpenRouter:', response.status, errorText);
      return NextResponse.json(
        { error: `Ошибка ИИ-провайдера (${response.status})`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Validate response shape
    const content = data?.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      console.error('Unexpected OpenRouter response shape:', JSON.stringify(data));
      return NextResponse.json(
        { error: 'Неожиданный формат ответа от ИИ-провайдера' },
        { status: 502 }
      );
    }

    // Return in the standard OpenAI-compatible shape
    return NextResponse.json({
      choices: [
        {
          message: {
            content,
          },
        },
      ],
      // Pass through usage stats if available (for token counting)
      usage: data?.usage ?? null,
    });

  } catch (error: any) {
    console.error('Критическая ошибка сервера (API Chat):', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error?.message ?? 'unknown') }, { status: 500 });
  }
}
