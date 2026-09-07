export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.status(200).json({
    ok: true,
    provider: "gigachat",
    model: process.env.GIGACHAT_MODEL || "GigaChat-2",
    hasCredentials: Boolean(process.env.GIGACHAT_CREDENTIALS),
    runtime: "vercel-serverless",
    localFallback: true
  });
}
