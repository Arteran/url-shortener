document.getElementById('urlForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('longUrl').value;
  const resDiv = document.getElementById('result');
  resDiv.style.display = 'block';
  resDiv.innerHTML = 'Завантаження...';

  try {
    const response = await fetch('/api/shorturl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      resDiv.innerHTML = `<span class="error">Помилка: ${data.error || 'Щось пішло не так'}</span>`;
      return;
    }

    resDiv.innerHTML = `
      <p>Успіх!</p>
      <p>Короткий URL: <a href="${data.short_url_full}" target="_blank">${data.short_url_full}</a></p>
    `;
  } catch (err) {
    resDiv.innerHTML = `<span class="error">Помилка мережі: ${err.message}</span>`;
  }
});
