const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const button = document.querySelector("#sendButton");
const messages = document.querySelector("#messages");

const history = [];

function addMessage(content, role = "bot") {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = content;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function setLoading(isLoading) {
  button.disabled = isLoading;
  input.disabled = isLoading;
  button.textContent = isLoading ? "Думаю..." : "Отправить";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addMessage(text, "user");
  history.push({ role: "user", content: text });

  const loading = addMessage("Печатаю ответ...", "bot");
  setLoading(true);

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: history.slice(-12)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Ошибка сервера");
    }

    loading.textContent = data.reply;
    history.push({ role: "assistant", content: data.reply });
  } catch (error) {
    loading.remove();
    addMessage(error.message || "Ошибка соединения с сервером", "error");
  } finally {
    setLoading(false);
    input.focus();
  }
});
