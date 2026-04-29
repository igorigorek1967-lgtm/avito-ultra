import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://omnihub.su',
        'X-Title': 'OmniHub',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }]
      })
    });

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