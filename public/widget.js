(() => {
  const script = document.currentScript;
  const title = script?.dataset?.title || "ИИ-помощник";
  const subtitle = script?.dataset?.subtitle || "Задайте вопрос";
  const apiBase = script?.dataset?.apiBase || new URL(script.src).origin;

  const root = document.createElement("div");
  root.id = "deepseek-double-widget";
  root.innerHTML = `
    <style>
      #deepseek-double-widget * { box-sizing: border-box; }
      #deepseek-double-widget .ddw-button {
        position: fixed; right: 22px; bottom: 22px; z-index: 999998;
        width: 64px; height: 64px; border-radius: 999px; border: 0;
        background: #2457ff; color: #fff; font-size: 28px; cursor: pointer;
        box-shadow: 0 16px 40px rgba(36, 87, 255, .35);
      }
      #deepseek-double-widget .ddw-panel {
        position: fixed; right: 22px; bottom: 96px; z-index: 999999;
        width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100vh - 120px));
        display: none; overflow: hidden; border-radius: 24px; background: white;
        border: 1px solid #dbe3ef; box-shadow: 0 22px 70px rgba(15, 23, 42, .22);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #deepseek-double-widget .ddw-panel.open { display: flex; flex-direction: column; }
      #deepseek-double-widget .ddw-head { padding: 16px; background: #2457ff; color: white; }
      #deepseek-double-widget .ddw-head strong { display: block; font-size: 16px; }
      #deepseek-double-widget .ddw-head span { opacity: .88; font-size: 13px; }
      #deepseek-double-widget .ddw-messages { flex: 1; overflow-y: auto; padding: 14px; background: #f8fafc; }
      #deepseek-double-widget .ddw-msg { padding: 10px 12px; border-radius: 16px; margin-bottom: 10px; line-height: 1.42; white-space: pre-wrap; font-size: 14px; }
      #deepseek-double-widget .ddw-bot { background: white; color: #172033; }
      #deepseek-double-widget .ddw-user { background: #2457ff; color: white; margin-left: 42px; }
      #deepseek-double-widget .ddw-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e2e8f0; }
      #deepseek-double-widget textarea { flex: 1; resize: none; border: 1px solid #cbd5e1; border-radius: 14px; padding: 10px; font: inherit; font-size: 14px; outline: none; }
      #deepseek-double-widget .ddw-send { border: 0; border-radius: 14px; background: #2457ff; color: white; padding: 0 12px; font-weight: 700; cursor: pointer; }
      @media (max-width: 520px) {
        #deepseek-double-widget .ddw-panel { right: 12px; bottom: 88px; }
        #deepseek-double-widget .ddw-button { right: 14px; bottom: 14px; }
      }
    </style>
    <button class="ddw-button" type="button" aria-label="Открыть чат">💬</button>
    <section class="ddw-panel" aria-label="${title}">
      <div class="ddw-head"><strong>${title}</strong><span>${subtitle}</span></div>
      <div class="ddw-messages"><div class="ddw-msg ddw-bot">Здравствуйте! Я ИИ-помощник. Чем помочь?</div></div>
      <form class="ddw-form">
        <textarea rows="2" placeholder="Ваш вопрос..." required></textarea>
        <button class="ddw-send" type="submit">➤</button>
      </form>
    </section>
  `;

  document.body.appendChild(root);

  const openButton = root.querySelector(".ddw-button");
  const panel = root.querySelector(".ddw-panel");
  const form = root.querySelector(".ddw-form");
  const input = root.querySelector("textarea");
  const send = root.querySelector(".ddw-send");
  const box = root.querySelector(".ddw-messages");
  const history = [];

  function add(content, kind) {
    const msg = document.createElement("div");
    msg.className = `ddw-msg ddw-${kind}`;
    msg.textContent = content;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
    return msg;
  }

  openButton.addEventListener("click", () => panel.classList.toggle("open"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    add(text, "user");
    history.push({ role: "user", content: text });
    const loading = add("Печатаю ответ...", "bot");
    input.disabled = true;
    send.disabled = true;

    try {
      const response = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: history.slice(-12) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка сервера");
      loading.textContent = data.reply;
      history.push({ role: "assistant", content: data.reply });
    } catch (error) {
      loading.textContent = error.message || "Ошибка соединения";
    } finally {
      input.disabled = false;
      send.disabled = false;
      input.focus();
    }
  });
})();
