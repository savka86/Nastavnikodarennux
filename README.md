# Цифровой двойник на OpenRouter для Render

Это исправленная версия проекта. Она показывает настоящую ошибку OpenRouter: 401, 402, 429, неверная модель и т.д.

## Самое важное исправление

В `OPENROUTER_APP_NAME` используйте только латиницу:

```env
OPENROUTER_APP_NAME=Uchitelskaya 2.0 Digital Double
```

Не используйте русские буквы в `OPENROUTER_APP_NAME`, потому что это значение отправляется как HTTP-заголовок `X-OpenRouter-Title`.

Также не пишите буквально:

```env
OPENROUTER_SITE_URL=https://твой-сайт.ru
```

Лучше временно поставить:

```env
OPENROUTER_SITE_URL=https://example.com
```

или ссылку на ваш Render-сервис.

## Переменные для Render

```env
OPENROUTER_API_KEY=твой_ключ_OpenRouter
OPENROUTER_MODEL=deepseek/deepseek-v4-flash:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_APP_NAME=Uchitelskaya 2.0 Digital Double
OPENROUTER_SITE_URL=https://example.com
ALLOWED_ORIGINS=*
TEMPERATURE=0.7
MAX_TOKENS=900
```

## Если free-модель не работает

Замените модель в Render:

```env
OPENROUTER_MODEL=deepseek/deepseek-chat
```

или:

```env
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

После изменения переменных нажмите:

```text
Manual Deploy → Deploy latest commit
```

## Как проверить сервер

Откройте ссылку:

```text
https://ВАШ-СЕРВИС.onrender.com/health
```

Должно быть примерно:

```json
{
  "ok": true,
  "provider": "openrouter",
  "model": "deepseek/deepseek-v4-flash:free",
  "hasOpenRouterKey": true
}
```

Если `hasOpenRouterKey: false`, значит ключ не добавлен в Render Environment.

## Render

Service Type: Web Service
Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Не выбирайте Static Site.
