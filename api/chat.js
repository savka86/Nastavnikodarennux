import https from "https";
import { randomUUID } from "crypto";

const GIGACHAT_BASE_URL = process.env.GIGACHAT_BASE_URL || "https://api.giga.chat";
const GIGACHAT_OAUTH_URL = process.env.GIGACHAT_OAUTH_URL || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS";
const MODEL = process.env.GIGACHAT_MODEL || "GigaChat-2";
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 10);
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 700);
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.6);

const SYSTEM_PROMPT = `
Ты — цифровой помощник Сидоровой Матрены Семеновны, наставника одарённых учащихся.
Ты помогаешь ученикам, родителям и педагогам по вопросам олимпиад, конкурсов, НПК, исследовательских и проектных работ.
Всегда ясно говори, что ты цифровой помощник, а не сама Матрена Семеновна.
Отвечай по-русски, доброжелательно, понятно и по делу.
Если данных мало — задай 2–4 коротких уточняющих вопроса.
Не придумывай расписание, контакты, достижения или личные данные.
Не обещай гарантированную победу и не выдавай готовые ответы для текущих экзаменов или олимпиад.
Ты умеешь составлять план подготовки к олимпиаде, предлагать темы для НПК и проектов, формулировать цель, задачи, гипотезу, объект, предмет и методы, помогать с речью защиты и вопросами жюри.
`.trim();

let cachedToken = null;
let cachedTokenExpiresAt = 0;
let tokenPromise = null;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getCredentials() {
  return String(process.env.GIGACHAT_CREDENTIALS || "").trim();
}

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

function requestOAuthToken() {
  const credentials = getCredentials();
  if (!credentials) return Promise.reject(new Error("GIGACHAT_CREDENTIALS is not configured"));

  return new Promise((resolve, reject) => {
    const url = new URL(GIGACHAT_OAUTH_URL);
    const body = `scope=${encodeURIComponent(GIGACHAT_SCOPE)}`;
    const req = https.request({
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
      // GigaChat uses the Russian Ministry of Digital Development root CA.
      // Vercel does not ship it by default, so SSL verification is disabled only for this OAuth call.
      rejectUnauthorized: false
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (raw += chunk));
      response.on("end", () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (response.statusCode < 200 || response.statusCode >= 300 || !data.access_token) {
          reject(new Error(`GigaChat OAuth ${response.statusCode}: ${data.message || data.error || raw.slice(0, 300)}`));
          return;
        }
        resolve(data);
      });
    });
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
      const serverExpiry = Number(data.expires_at || 0);
      cachedTokenExpiresAt = serverExpiry > Date.now()
        ? serverExpiry - 2 * 60 * 1000
        : Date.now() + 25 * 60 * 1000;
      return cachedToken;
    })
    .finally(() => { tokenPromise = null; });

  return tokenPromise;
}

async function callGigaChat(messages, forceRefresh = false) {
  const token = await getAccessToken(forceRefresh);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
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

function localFallbackReply(message) {
  const text = String(message || "").toLowerCase();
  if (/олимпиад/.test(text)) return "Я цифровой помощник Матрены Семеновны. Для плана подготовки напишите предмет, класс, этап олимпиады и сколько времени осталось. Я помогу построить маршрут: диагностика → слабые темы → ежедневная практика → разбор ошибок → тренировочный вариант.";
  if (/нпк|проект|тем/.test(text)) return "Я цифровой помощник Матрены Семеновны. Для НПК напишите класс и интерес ученика. Я помогу подобрать посильную тему, сформулировать цель, задачи, гипотезу, методы и конечный продукт.";
  if (/защит|реч/.test(text)) return "Я цифровой помощник Матрены Семеновны. Пришлите тему проекта и главный результат — я помогу собрать речь защиты по схеме: проблема → цель → что сделали → результат → практическая польза → вывод.";
  if (/жюри|вопрос/.test(text)) return "Я цифровой помощник Матрены Семеновны. Типичные вопросы жюри: почему выбрана тема, в чём новизна, как проверяли гипотезу, почему выбраны эти методы, что было самым трудным, где применить результат и что сделать дальше. Пришлите тему — адаптирую вопросы под проект.";
  return "Я цифровой помощник Матрены Семеновны. Могу помочь с олимпиадами, НПК, проектами, целью и задачами исследования, речью защиты и вопросами жюри. Напишите класс ученика и задачу.";
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "Пустое сообщение." });

  const fallback = () => res.status(200).json({ reply: localFallbackReply(message), mode: "local-fallback" });
  if (!getCredentials()) return fallback();

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...normalizeHistory(req.body?.history),
    { role: "user", content: message }
  ];

  try {
    let result = await callGigaChat(messages);
    if (result.response.status === 401) {
      cachedToken = null;
      cachedTokenExpiresAt = 0;
      result = await callGigaChat(messages, true);
    }
    if (!result.response.ok) {
      console.warn("GigaChat HTTP error", result.response.status, result.data);
      return fallback();
    }
    const reply = result.data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return fallback();
    return res.status(200).json({ reply, mode: "gigachat", model: MODEL });
  } catch (error) {
    console.warn("GigaChat connection error", error?.message || error);
    return fallback();
  }
}
