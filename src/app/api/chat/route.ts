import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    : null;

export async function POST(req: Request) {
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
    const { messages, systemPrompt, logToChatLogs, userId, source } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Неверный формат сообщений' }, { status: 400 });
    }

    const formattedMessages = [
      { role: 'system', content: systemPrompt || 'Ты — полезный ИИ-ассистент.' },
      ...messages,
    ];

    const siteUrl = process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const openRouterHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
      'X-Title': 'OmniHub',
      'HTTP-Referer': siteUrl,
      Referer: siteUrl,
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders,
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: formattedMessages,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text().catch(() => '');
      console.error('OpenRouter auth error full response:', response.status, errorText);
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
      console.error('Полный текст ошибки от OpenRouter:', response.status, errorText);
      return NextResponse.json(
        { error: `Ошибка ИИ-провайдера (${response.status})`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      console.error('Unexpected OpenRouter response shape:', JSON.stringify(data));
      return NextResponse.json(
        { error: 'Неожиданный формат ответа от ИИ-провайдера' },
        { status: 502 }
      );
    }

    if (logToChatLogs && supabaseAdmin) {
      const latestUserMessage = [...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? null;
      const { error: logError } = await supabaseAdmin.from('chat_logs').insert({
        user_id: userId ?? null,
        source: source ?? 'guide',
        user_message: latestUserMessage,
        bot_response: content,
        payload: { messages_count: messages.length },
      });
      if (logError) {
        console.error('chat_logs insert error:', logError.message);
      }
    }

    return NextResponse.json({
      choices: [{ message: { content } }],
      usage: data?.usage ?? null,
    });
  } catch (error: any) {
    console.error('Критическая ошибка сервера (API Chat):', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера: ' + (error?.message ?? 'unknown') }, { status: 500 });
  }
}
