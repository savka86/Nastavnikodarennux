import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const GIGACHAT_BASE_URL = process.env.GIGACHAT_BASE_URL || "https://api.giga.chat";
const GIGACHAT_OAUTH_URL = process.env.GIGACHAT_OAUTH_URL || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const MODEL = process.env.GIGACHAT_MODEL || "GigaChat-2";
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

let cachedToken = null;
let cachedTokenExpiresAt = 0;
let tokenPromise = null;

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

function getCredentials() {
  return String(process.env.GIGACHAT_CREDENTIALS || process.env.GIGACHAT_AUTH_KEY || "").trim();
}

function requestOAuthToken() {
  const credentials = getCredentials();
  if (!credentials) return Promise.reject(new Error("GIGACHAT_CREDENTIALS is not configured"));

  return new Promise((resolve, reject) => {
    const url = new URL(GIGACHAT_OAUTH_URL);
    const body = `scope=${encodeURIComponent(GIGACHAT_SCOPE)}`;
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          RqUID: randomUUID(),
          Authorization: `Basic ${credentials}`,
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 12000,
        rejectUnauthorized: process.env.GIGACHAT_VERIFY_SSL !== "false"
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
          if (res.statusCode < 200 || res.statusCode >= 300 || !data.access_token) {
            reject(new Error(`GigaChat OAuth ${res.statusCode}: ${data.message || data.error || raw.slice(0, 300)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("GigaChat OAuth timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  if (!forceRefresh && tokenPromise) return tokenPromise;

  tokenPromise = requestOAuthToken()
    .then((data) => {
      cachedToken = data.access_token;
      // OAuth token lives 30 minutes; refresh a few minutes early.
      cachedTokenExpiresAt = Date.now() + 25 * 60 * 1000;
      return cachedToken;
    })
    .finally(() => { tokenPromise = null; });

  return tokenPromise;
}

async function callGigaChat(messages, forceRefresh = false) {
  const token = await getAccessToken(forceRefresh);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${GIGACHAT_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
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
    return `Я цифровой помощник Матрены Семеновны. Предлагаю 6 реальных тем для ${grade}:\n\n1. «Как цифровые привычки влияют на учебную концентрацию школьников».\n2. «Какие местные растения подходят для школьного мини-гербария и почему».\n3. «Как меняется качество сна школьников в зависимости от экранного времени».\n4. «История моего села в семейных фотографиях и воспоминаниях».\n5. «Можно ли уменьшить количество бытовых отходов в классе за одну неделю».\n6. «Какие способы запоминания слов работают лучше: карточки, рисунки или ассоциации».\n\nНапишите интересы ученика — я помогу сузить список.`;
  }

  if (/олимпиад/.test(text) && /(план|подготов|готов)/.test(text)) {
    return `Я цифровой помощник Матрены Семеновны. Базовый план подготовки к олимпиаде:\n\n1. Определить предмет, класс и этап.\n2. Решить диагностический вариант.\n3. Разделить ошибки по темам.\n4. Повторить 2–3 слабых блока.\n5. Ежедневно решать задачи повышенной сложности.\n6. Вести журнал ошибок.\n7. Раз в неделю проходить вариант на время.\n8. Перед олимпиадой повторить типовые приёмы.\n\nНапишите предмет и класс — составлю конкретный план.`;
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
    provider: "gigachat",
    model: MODEL,
    scope: GIGACHAT_SCOPE,
    localFallback: true,
    hasCredentials: Boolean(getCredentials()),
    tokenCached: Boolean(cachedToken && Date.now() < cachedTokenExpiresAt)
  });
});

app.post("/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Пустое сообщение." });

  const localReply = () => res.json({ reply: localFallbackReply(message), mode: "local-fallback" });
  if (!getCredentials()) return localReply();

  const history = normalizeHistory(req.body?.history);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message }
  ];

  try {
    let result = await callGigaChat(messages);

    // Access token may expire; refresh once automatically.
    if (result.response.status === 401) {
      cachedToken = null;
      cachedTokenExpiresAt = 0;
      result = await callGigaChat(messages, true);
    }

    if (!result.response.ok) {
      console.warn("GigaChat unavailable, switching to local fallback:", result.response.status, result.data);
      return localReply();
    }

    const reply = result.data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return localReply();

    return res.json({ reply, model: MODEL, mode: "gigachat" });
  } catch (error) {
    console.warn("GigaChat connection failed, switching to local fallback:", error?.message || error);
    return localReply();
  }
});

app.listen(PORT, () => {
  console.log(`Matrena assistant started on port ${PORT}`);
  console.log(`Provider: GigaChat`);
  console.log(`Model: ${MODEL}`);
  console.log("Local fallback: enabled");
});
