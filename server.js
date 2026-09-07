import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const FALLBACK_MODEL = "openrouter/free";
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

function buildHeaders() {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": "Matrena AI Assistant"
  };
  const siteUrl = process.env.OPENROUTER_SITE_URL;
  if (siteUrl && /^https?:\/\//i.test(siteUrl)) headers["HTTP-Referer"] = siteUrl;
  return headers;
}

async function callModel(model, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false,
        provider: { allow_fallbacks: true }
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
    return `Я цифровой помощник Матрены Семеновны. Предлагаю 6 реальных тем для ${grade}:\n\n1. «Как цифровые привычки влияют на учебную концентрацию школьников».\n2. «Какие местные растения лучше всего подходят для школьного мини-гербария и почему».\n3. «Как меняется качество сна у школьников в зависимости от экранного времени».\n4. «История моего села в семейных фотографиях и воспоминаниях».\n5. «Можно ли уменьшить количество бытовых отходов в классе за одну неделю».\n6. «Какие способы запоминания слов работают лучше: карточки, рисунки или ассоциации».\n\nДля НПК лучше выбрать тему, где можно собрать собственные данные: опрос, наблюдение, небольшой эксперимент или интервью. Напишите интересы ученика — я сузю список до 3 сильных тем.`;
  }

  if (/олимпиад/.test(text) && /(план|подготов|готов)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Базовый план подготовки к олимпиаде:\n\n1. Определить предмет, класс и этап олимпиады.\n2. Решить 1 диагностический вариант без подсказок.\n3. Разделить ошибки на темы.\n4. Выбрать 2–3 слабых блока и повторить теорию.\n5. Ежедневно решать 3–5 задач повышенной сложности.\n6. Вести журнал ошибок: задача → ошибка → правильный ход.\n7. Раз в неделю проходить тренировочный вариант на время.\n8. За 2–3 дня до участия снизить нагрузку и повторить типовые приёмы.\n\nНапишите предмет и класс — составлю конкретный план на неделю или месяц.`;
  }

  if (/реч|защит|выступ/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Каркас сильной речи для защиты:\n\n«Здравствуйте. Тема моей работы — … Я выбрал её, потому что … Цель работы — … Для достижения цели я поставил задачи: … В ходе работы использовал методы: … Главный результат — … Практическая польза моей работы заключается в … Спасибо за внимание, готов ответить на вопросы».\n\nОптимальная структура: проблема → цель → 3–4 задачи → что сделал → главный результат → польза.\n\nПришлите тему проекта — я превращу этот каркас в готовую речь на 2–3 минуты.`;
  }

  if (/жюри|вопрос/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Вот 7 типичных вопросов жюри:\n\n1. Почему вы выбрали именно эту тему?\n2. В чём новизна вашей работы?\n3. Как вы проверяли гипотезу?\n4. Почему выбрали именно эти методы?\n5. Что оказалось самым трудным?\n6. Где можно применить результат на практике?\n7. Что бы вы изменили, если бы продолжили исследование?\n\nГлавное правило ответа: сначала короткий вывод, потом одно доказательство из своей работы. Напишите тему — подготовлю ответы именно под неё.`;
  }

  if (/(цель|задач|гипотез|объект|предмет)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Для исследовательской работы используйте формулу:\n\n• Цель — один итог: «изучить / определить / выяснить…».\n• Задачи — 3–5 шагов к цели: изучить источники, провести опрос/эксперимент, обработать данные, сделать выводы.\n• Гипотеза — проверяемое предположение: «если…, то…».\n• Объект — что изучаем в целом.\n• Предмет — какое свойство или сторону объекта изучаем.\n• Методы — наблюдение, опрос, эксперимент, сравнение, анализ данных.\n\nНапишите тему проекта — сформулирую всё под неё.`;
  }

  if (/родител/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Для поддержки одарённого ребёнка важно не увеличивать количество занятий бесконечно, а выстроить маршрут: интерес → цель → диагностика → регулярная практика → разбор ошибок → участие в подходящем конкурсе или олимпиаде.\n\nНачните с трёх вопросов ребёнку: что ему действительно интересно, какие задачи он любит и какой результат хотел бы получить. После этого можно выбрать направление подготовки.`;
  }

  return `Я цифровой помощник Матрены Семеновны. Могу помочь с четырьмя основными задачами:\n\n1. Подобрать тему для НПК или проекта.\n2. Составить план подготовки к олимпиаде.\n3. Оформить цель, задачи, гипотезу и методы исследования.\n4. Подготовить речь и возможные вопросы жюри.\n\nНапишите класс ученика, предмет или интерес и что нужно получить — я соберу пошаговый вариант.`;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "hybrid",
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    localFallback: true,
    hasKey: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

app.post("/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Пустое сообщение." });

  const localReply = () => res.json({ reply: localFallbackReply(message), mode: "local-fallback" });

  if (!process.env.OPENROUTER_API_KEY) return localReply();

  try {
    const history = normalizeHistory(req.body?.history);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message }
    ];

    let usedModel = PRIMARY_MODEL;
    let result = await callModel(PRIMARY_MODEL, messages);

    if (!result.response.ok && [429, 402, 502, 503].includes(result.response.status) && PRIMARY_MODEL !== FALLBACK_MODEL) {
      usedModel = FALLBACK_MODEL;
      result = await callModel(FALLBACK_MODEL, messages);
    }

    if (!result.response.ok) {
      console.warn("OpenRouter unavailable, switching to local fallback:", result.response.status, result.data);
      return localReply();
    }

    const reply = result.data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return localReply();

    return res.json({ reply, model: usedModel, mode: "openrouter" });
  } catch (error) {
    console.warn("OpenRouter connection failed, switching to local fallback:", error?.message || error);
    return localReply();
  }
});

app.listen(PORT, () => {
  console.log(`Matrena hybrid assistant started on port ${PORT}`);
  console.log(`Primary model: ${PRIMARY_MODEL}`);
  console.log("Local fallback: enabled");
});
