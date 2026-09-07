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
Отвечай по-русски, доброжелательно, понятно и по делу. Не перегружай ответ.

Ты умеешь:
— составлять план подготовки к олимпиаде;
— предлагать темы для НПК и проекта;
— помогать сформулировать тему, актуальность, цель, задачи, гипотезу, объект, предмет и методы;
— помогать готовить речь и ответы на вопросы жюри;
— разбирать типичные ошибки;
— предлагать тренировочные задания и план работы;
— помогать родителям и педагогам выстроить сопровождение одарённого ребёнка.

Если данных мало, задай 2–4 коротких уточняющих вопроса.
Не придумывай расписание, контакты, достижения или личные данные.
Не обещай гарантированную победу и не выдавай готовые ответы для текущих экзаменов или олимпиад.
В конце ответа по возможности предлагай один следующий шаг.
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
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(),
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
}

function errorText(status, data) {
  const message = data?.error?.message || data?.message || "ошибка провайдера";
  if (status === 429) {
    return "Сейчас бесплатный лимит OpenRouter временно исчерпан. Попробуйте ещё раз позже или подключите небольшой баланс OpenRouter.";
  }
  if (status === 401) return "Неверный или отсутствующий ключ OpenRouter.";
  if (status === 402) return "На аккаунте OpenRouter недостаточно доступного баланса/кредита.";
  return `OpenRouter ${status}: ${message}`;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "openrouter",
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    hasKey: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "На Render не задан OPENROUTER_API_KEY." });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "Пустое сообщение." });

    const history = normalizeHistory(req.body?.history);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message }
    ];

    let usedModel = PRIMARY_MODEL;
    let { response, data } = await callModel(PRIMARY_MODEL, messages);

    if (!response.ok && [429, 502, 503].includes(response.status) && PRIMARY_MODEL !== FALLBACK_MODEL) {
      console.warn(`Primary model ${PRIMARY_MODEL} failed with ${response.status}; retrying ${FALLBACK_MODEL}`);
      usedModel = FALLBACK_MODEL;
      ({ response, data } = await callModel(FALLBACK_MODEL, messages));
    }

    if (!response.ok) {
      console.error("OpenRouter error:", response.status, data);
      return res.status(response.status).json({
        error: errorText(response.status, data),
        model: usedModel
      });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: "Модель не вернула текстовый ответ." });
    }

    res.json({ reply, model: usedModel });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: `Ошибка соединения с OpenRouter: ${error.message || "неизвестная ошибка"}` });
  }
});

app.listen(PORT, () => {
  console.log(`Matrena assistant started on port ${PORT}`);
  console.log(`Primary model: ${PRIMARY_MODEL}`);
  console.log(`Fallback model: ${FALLBACK_MODEL}`);
});
