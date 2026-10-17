document.getElementById("urlForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("longUrl").value;
  const resDiv = document.getElementById("result");
  resDiv.style.display = "block";
  resDiv.textContent = "Завантаження...";

  try {
    const response = await fetch("/api/shorturl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    resDiv.replaceChildren();

    if (!response.ok) {
      const span = document.createElement("span");
      span.className = "error";
      span.textContent = `Помилка: ${data.error || "Щось пішло не так"}`;
      resDiv.appendChild(span);
      return;
    }

    const pSuccess = document.createElement("p");
    pSuccess.textContent = "Успіх!";

    const pUrl = document.createElement("p");
    pUrl.textContent = "Короткий URL: ";

    const link = document.createElement("a");
    link.href = data.short_url_full;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = data.short_url_full;

    pUrl.appendChild(link);
    resDiv.appendChild(pSuccess);
    resDiv.appendChild(pUrl);
  } catch (err) {
    resDiv.replaceChildren();
    const span = document.createElement("span");
    span.className = "error";
    span.textContent = `Помилка мережі: ${err.message}`;
    resDiv.appendChild(span);
  }
});
