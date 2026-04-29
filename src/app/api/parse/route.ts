import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY is not set in environment variables.');
      return NextResponse.json(
        { error: 'Сервер не настроен: отсутствует OPENROUTER_API_KEY. Добавьте ключ в .env.local' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { niche, links } = body;

    // Если ссылок нет, заставляем ИИ работать только по названию ниши
    const inputData = (links && links.trim() !== '') ? links : `Ниша: ${niche}. Ссылок нет, проанализируй типовых конкурентов в этой нише.`;

    const systemPrompt = `Ты — Экспертный системный аналитик Авито.
    Проанализируй нишу "${niche}" и переданные данные: ${inputData}.
    Формат ответа СТРОГО валидный JSON:
    {
      "competitors": [
        { "name": "Название конкурента или ссылка", "pros": "Что у них сделано хорошо", "cons": "В чем их главная слабость" }
      ],
      "marketStrengths": "Кратко: общие сильные стороны рынка",
      "marketWeaknesses": "Кратко: общие слабые места рынка",
      "promptAddition": "Четкая инструкция для ИИ-бота клиента, как бить в эти слабые места"
    }
    Твоя задача — расписать в массиве competitors детальный анализ по каждой ссылке/конкуренту.`;

    const requestOrigin = req.headers.get('origin');
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    const openRouterHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
      'X-Title': 'OmniHub',
    };

    const referer = requestOrigin || configuredSiteUrl;
    if (referer) {
      openRouterHeaders['HTTP-Referer'] = referer;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders,
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }]
      })
    });

    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text().catch(() => '');
      console.error('OpenRouter auth error:', response.status, errorText);
      return NextResponse.json(
        {
          error: `Ошибка авторизации OpenRouter (${response.status}): проверьте OPENROUTER_API_KEY и настройки реферера`,
          details: errorText,
        },
        { status: 401 }
      );
    }

    if (!response.ok) throw new Error('Сбой API нейросети');

    const data = await response.json();
    const parsedResult = JSON.parse(data.choices[0].message.content);

    return NextResponse.json(parsedResult);

  } catch (error: any) {
    console.error('Ошибка парсера:', error);
    // Броня: если ИИ тупит, мы не роняем сайт ошибкой 500, а отдаем заглушку, чтобы интерфейс не зависал
    return NextResponse.json({
       competitors: [{ name: "Системная ошибка", pros: "-", cons: "Не удалось связаться с нейросетью. Попробуйте нажать кнопку еще раз." }],
       marketStrengths: "Сервер перегружен",
       marketWeaknesses: "Нет ответа",
       promptAddition: "Повторите попытку генерации."
    });
  }
}
