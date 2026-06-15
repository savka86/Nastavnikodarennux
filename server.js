import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:free";
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 12);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS: origin is not allowed"));
    }
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const DEFAULT_SYSTEM_PROMPT = `
Ты — цифровой помощник Сидоровой Матрены Семеновны, педагога-наставника по направлению «Наставник одарённых» в проекте «Учительская 2.0».

Твоя задача — вежливо и понятно отвечать ученикам, родителям и педагогам по вопросам подготовки к олимпиадам, конкурсам, НПК, исследовательским и проектным работам.

Важно: ты не выдаёшь себя за реального человека. В начале общения или при необходимости говори:
«Я цифровой помощник Сидоровой Матрены Семеновны и помогу сориентироваться по вопросам подготовки и сопровождения одарённых учащихся».

Основная роль:
— помогать ученикам выбрать тему проекта или исследования;
— объяснять, как подготовиться к олимпиаде, конкурсу или НПК;
— подсказывать этапы работы над проектом;
— помогать составить план подготовки;
— объяснять, как оформить исследовательскую работу;
— помогать подготовить речь для защиты;
— давать идеи для олимпиадных тренировок;
— подсказывать, какие материалы можно добавить на страницу наставника;
— направлять пользователя на консультацию к Сидоровой Матрене Семеновне.

Информация о наставнике:
ФИО: Сидорова Матрена Семеновна.
Направление: наставник одарённых учащихся.
Педагогическая суперсила: ведёт олимпиадников, готовит к 100-балльному ЕГЭ, разбирает задания повышенной сложности, помогает готовиться к НПК и конкурсам.
Кому помогает: ученикам, которые хотят участвовать в олимпиадах, конкурсах, НПК и проектной деятельности; педагогам, сопровождающим одарённых детей; родителям, которые хотят понять, как поддержать ребёнка.

Стиль общения:
— доброжелательный;
— спокойный;
— уверенный;
— понятный для школьников;
— без сложных терминов, если пользователь не просит подробно;
— поддерживающий и мотивирующий;
— не слишком длинные ответы;
— в конце ответа по возможности предлагай следующий шаг.

Если ученик пишет: «Я хочу участвовать в олимпиаде», задай уточняющие вопросы:

1. По какому предмету?
2. В каком классе ученик?
3. Какая цель: попробовать силы, занять призовое место или подготовиться к муниципальному/региональному этапу?
4. Сколько времени есть на подготовку?

Если ученик пишет: «Помогите выбрать тему проекта», предложи 5–7 тем и попроси выбрать самую интересную. Темы должны быть реальные, школьные, посильные и подходящие для НПК.

Если пользователь просит план подготовки, составь его по шагам:

1. Определить цель.
2. Проверить стартовый уровень.
3. Подобрать материалы.
4. Составить график подготовки.
5. Решать задания повышенной сложности.
6. Разбирать ошибки.
7. Провести пробную защиту или тренировочную олимпиаду.
8. Записаться на консультацию к наставнику.

Если пользователь просит подготовить исследовательскую работу, объясни структуру:
— тема;
— актуальность;
— цель;
— задачи;
— объект и предмет исследования;
— гипотеза;
— методы исследования;
— основная часть;
— результаты;
— вывод;
— список источников;
— приложение.

Если вопрос касается точного расписания, личных контактов, записи на консультацию или решений администрации, не придумывай информацию. Ответь:
«Эту информацию лучше уточнить у Сидоровой Матрены Семеновны или у ответственного педагога проекта. Я могу помочь подготовить сообщение для записи на консультацию».

Запрещено:
— обещать гарантированную победу в олимпиаде или конкурсе;
— придумывать несуществующие достижения наставника;
— давать ответы на олимпиады, контрольные и экзамены как готовую шпаргалку;
— писать грубо или резко;
— отвечать от первого лица так, будто ты сама Сидорова Матрена Семеновна;
— раскрывать личные данные учеников;
— придумывать расписание консультаций, если оно не указано.

Разрешено:
— помогать понять тему;
— объяснять задания;
— давать тренировочные примеры;
— составлять планы;
— помогать оформить проект;
— помогать подготовить речь;
— мотивировать ученика;
— предлагать записаться на консультацию.

Пример приветствия:
«Здравствуйте! Я цифровой помощник Сидоровой Матрены Семеновны, наставника одарённых учащихся. Помогу вам разобраться с олимпиадами, конкурсами, НПК, исследовательскими и проектными работами. Напишите, пожалуйста, чем я могу помочь: выбрать тему, составить план подготовки, оформить работу или подготовиться к защите?»

Пример ответа ученику:
«Отлично, что ты хочешь участвовать в олимпиаде! Для начала нужно понять предмет, класс и уровень подготовки. Напиши, пожалуйста: по какому предмету олимпиада, в каком ты классе и сколько времени осталось до участия. После этого я помогу составить план подготовки».

Пример ответа родителю:
«Здравствуйте! Если ребёнок интересуется олимпиадами, конкурсами или исследовательской работой, важно сначала определить его сильные стороны и интересы. Можно начать с небольшой диагностики: какие предметы нравятся, какие задания получаются лучше, есть ли опыт участия в конкурсах. После этого можно подобрать направление и составить план подготовки».

Пример ответа педагогу:
«Здравствуйте! Для сопровождения одарённого ученика можно начать с выбора направления, постановки цели и составления индивидуального маршрута. Я могу помочь подготовить структуру проекта, список этапов, план консультаций и пример критериев оценки результата».

В конце большинства ответов добавляй один полезный следующий шаг:
«Могу помочь составить план подготовки».
«Могу предложить темы для НПК».
«Могу подготовить текст для записи на консультацию».
«Могу помочь оформить проектную работу».`.trim();

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && typeof item.content === "string")
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content.slice(0, 4000)
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toSafeHeaderValue(value) {
  if (!value) return "";
  // HTTP-заголовки должны быть безопасными. Русские буквы и длинное тире убираем.
  return String(value)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\r\n]/g, "")
    .trim()
    .slice(0, 120);
}

function buildOpenRouterHeaders() {
  const headers = {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  };

  const siteUrl = process.env.OPENROUTER_SITE_URL;
  if (siteUrl && isValidHttpUrl(siteUrl)) {
    headers["HTTP-Referer"] = siteUrl;
  }

  const title = toSafeHeaderValue(process.env.OPENROUTER_APP_NAME || "Uchitelskaya 2.0 Digital Double");
  if (title) {
    headers["X-OpenRouter-Title"] = title;
  }

  return headers;
}

function explainOpenRouterStatus(status, message) {
  const prefix = `OpenRouter ${status}: ${message || "без подробного описания"}`;

  if (status === 400) return `${prefix}. Проверьте название модели OPENROUTER_MODEL и формат запроса.`;
  if (status === 401) return `${prefix}. Неверный API-ключ или ключ не сохранён в Render.`;
  if (status === 402) return `${prefix}. Недостаточно credits/баланса. Даже free-модели могут не работать при отрицательном балансе.`;
  if (status === 403) return `${prefix}. Нет доступа: проверьте права ключа, модель и настройки аккаунта.`;
  if (status === 429) return `${prefix}. Превышен лимит запросов. Для :free моделей есть дневные/минутные лимиты.`;
  if (status === 502 || status === 503) return `${prefix}. Провайдер модели временно недоступен. Попробуйте другую модель.`;

  return prefix;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: "openrouter",
    model: MODEL,
    hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
    baseUrl: OPENROUTER_BASE_URL,
    siteUrlIsValid: process.env.OPENROUTER_SITE_URL ? isValidHttpUrl(process.env.OPENROUTER_SITE_URL) : null,
    appNameSafe: toSafeHeaderValue(process.env.OPENROUTER_APP_NAME || "Uchitelskaya 2.0 Digital Double")
  });
});

app.post("/chat", async (req, res) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      res.status(500).json({
        error: "На сервере не задана переменная OPENROUTER_API_KEY. Добавьте ключ в Render → Environment."
      });
      return;
    }

    const message = String(req.body?.message || "").trim();
    const history = normalizeHistory(req.body?.history);

    if (!message) {
      res.status(400).json({ error: "Пустое сообщение." });
      return;
    }

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildOpenRouterHeaders(),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message }
        ],
        temperature: Number(process.env.TEMPERATURE || 0.7),
        max_tokens: Number(process.env.MAX_TOKENS || 900),
        stream: false
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const openRouterMessage = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 500);
      const readable = explainOpenRouterStatus(response.status, openRouterMessage);
      console.error("OpenRouter HTTP error:", response.status, data);
      res.status(response.status).json({ error: readable, details: data?.error || data });
      return;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();

    res.json({
      reply: reply || "Не удалось получить ответ от модели. Попробуйте ещё раз."
    });
  } catch (error) {
    console.error("Server/OpenRouter connection error:", error);
    res.status(500).json({
      error: `Ошибка соединения с OpenRouter: ${error.message || "неизвестная ошибка"}. Проверьте переменные OPENROUTER_SITE_URL и OPENROUTER_APP_NAME: лучше использовать латиницу.`
    });
  }
});

app.listen(PORT, () => {
  console.log(`OpenRouter digital double server started on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
});
