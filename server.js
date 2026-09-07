import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 10);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 700);
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.6);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const SYSTEM_PROMPT = `
Ты — цифровой помощник Сидоровой Матрены Семеновны, наставника одарённых учащихся.
Ты помогаешь ученикам, родителям и педагогам по вопросам олимпиад, конкурсов, НПК, исследовательских и проектных работ.

Всегда ясно говори, что ты цифровой помощник, а не сама Матрена Семеновна.
Отвечай по-русски, доброжелательно, понятно и по делу.
Если данных мало — задай 2–4 коротких уточняющих вопроса.
Не придумывай расписание, контакты, достижения или личные данные.
Не обещай гарантированную победу и не выдавай готовые ответы для текущих экзаменов или олимпиад.

Ты умеешь:
— составлять план подготовки к олимпиаде;
— предлагать темы для НПК и проектов;
— формулировать цель, задачи, гипотезу, объект, предмет и методы;
— помогать с речью защиты и вопросами жюри;
— разбирать типичные ошибки;
— предлагать тренировочные задания и пошаговый маршрут работы.
`.trim();

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item.content === "string")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content.slice(0, 3500)
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}

async function callDeepSeek(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY || ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        thinking: { type: "disabled" },
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function extractGrade(text) {
  const m = String(text).match(/\b([1-9]|10|11)\s*(?:класс|класса|кл\.?)/i);
  return m ? `${m[1]} класс` : "школьный уровень";
}

function localFallbackReply(message) {
  const text = String(message || "").toLowerCase();
  const grade = extractGrade(message);

  if (/тема|темы|нпк|проект/.test(text) && /(выб|предлож|придум|иде)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Предлагаю 6 реальных тем для ${grade}:\n\n1. «Как цифровые привычки влияют на учебную концентрацию школьников».\n2. «Какие местные растения лучше всего подходят для школьного мини-гербария и почему».\n3. «Как меняется качество сна у школьников в зависимости от экранного времени».\n4. «История моего села в семейных фотографиях и воспоминаниях».\n5. «Можно ли уменьшить количество бытовых отходов в классе за одну неделю».\n6. «Какие способы запоминания слов работают лучше: карточки, рисунки или ассоциации».\n\nДля НПК лучше выбирать тему, где ученик может собрать собственные данные: опрос, наблюдение, небольшой эксперимент или интервью. Напишите интересы ученика — я сузю список до 3 тем.`;
  }

  if (/олимпиад/.test(text) && /(план|подготов|готов)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Базовый план подготовки к олимпиаде:\n\n1. Определить предмет, класс и этап.\n2. Решить диагностический вариант.\n3. Разделить ошибки по темам.\n4. Повторить 2–3 слабых блока.\n5. Ежедневно решать задачи повышенной сложности.\n6. Вести журнал ошибок.\n7. Раз в неделю проходить вариант на время.\n8. Перед олимпиадой повторить типовые приёмы и снизить нагрузку.\n\nНапишите предмет и класс — составлю конкретный план.`;
  }

  if (/реч|защит|выступ/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Каркас речи для защиты:\n\n«Здравствуйте. Тема моей работы — … Я выбрал её, потому что … Цель работы — … Для достижения цели я поставил задачи: … В ходе работы использовал методы: … Главный результат — … Практическая польза моей работы заключается в … Спасибо за внимание, готов ответить на вопросы».\n\nПришлите тему проекта — я помогу адаптировать каркас.`;
  }

  if (/жюри|вопрос/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. 7 типичных вопросов жюри:\n\n1. Почему выбрана эта тема?\n2. В чём новизна работы?\n3. Как проверялась гипотеза?\n4. Почему выбраны именно эти методы?\n5. Что оказалось самым трудным?\n6. Где применим результат?\n7. Что бы вы изменили при продолжении исследования?\n\nНапишите тему — подготовлю варианты ответов.`;
  }

  if (/(цель|задач|гипотез|объект|предмет)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Формула исследовательской работы:\n\n• Цель — один итог: «изучить / определить / выяснить…».\n• Задачи — 3–5 шагов к цели.\n• Гипотеза — проверяемое предположение: «если…, то…».\n• Объект — что изучаем в целом.\n• Предмет — конкретная сторона объекта.\n• Методы — наблюдение, опрос, эксперимент, сравнение, анализ данных.\n\nНапишите тему проекта — сформулирую всё под неё.`;
  }

  return `Я цифровой помощник Матрены Семеновны. Могу помочь:\n\n1. Подобрать тему для НПК или проекта.\n2. Составить план подготовки к олимпиаде.\n3. Оформить цель, задачи и гипотезу.\n4. Подготовить речь и вопросы жюри.\n\nНапишите класс, предмет или интерес ученика и желаемый результат.`;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "deepseek-direct",
    model: MODEL,
    localFallback: true,
    hasDeepSeekKey: Boolean(process.env.DEEPSEEK_API_KEY)
  });
});

app.post("/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Пустое сообщение." });

  const localReply = () => res.json({ reply: localFallbackReply(message), mode: "local-fallback" });
  if (!process.env.DEEPSEEK_API_KEY) return localReply();

  try {
    const history = normalizeHistory(req.body?.history);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message }
    ];

    const { response, data } = await callDeepSeek(messages);

    if (!response.ok) {
      console.warn("DeepSeek unavailable, switching to local fallback:", response.status, data);
      return localReply();
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return localReply();

    return res.json({ reply, model: MODEL, mode: "deepseek" });
  } catch (error) {
    console.warn("DeepSeek connection failed, switching to local fallback:", error?.message || error);
    return localReply();
  }
});

app.listen(PORT, () => {
  console.log(`Matrena assistant started on port ${PORT}`);
  console.log(`Provider: DeepSeek direct`);
  console.log(`Model: ${MODEL}`);
  console.log("Local fallback: enabled");
});
