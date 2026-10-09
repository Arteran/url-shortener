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

let allUrls = [];

document.getElementById('showUrlsBtn').addEventListener('click', async () => {
  const panel = document.getElementById('adminPanel');
  const list = document.getElementById('urlList');
  
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  list.innerHTML = '<li>Завантаження...</li>';
  
  try {
    const response = await fetch('/api/admin/urls?limit=1000');
    const data = await response.json();
    if (response.ok) {
      allUrls = data.urls;
      renderUrls(allUrls);
    } else {
      list.innerHTML = `<li><span class="error">Помилка: ${data.error}</span></li>`;
    }
  } catch (err) {
    list.innerHTML = `<li><span class="error">Помилка мережі</span></li>`;
  }
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = allUrls.filter(u => 
    u.original_url.toLowerCase().includes(term) || 
    u.short_url.toLowerCase().includes(term)
  );
  renderUrls(filtered);
});

function renderUrls(urls) {
  const list = document.getElementById('urlList');
  list.innerHTML = '';
  if (urls.length === 0) {
    list.innerHTML = '<li>Нічого не знайдено</li>';
    return;
  }
  
  const host = window.location.origin;
  urls.forEach(u => {
    const shortFull = `${host}/api/shorturl/${u.short_url}`;
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="url-item-short"><a href="${shortFull}" target="_blank">${shortFull}</a></div>
      <div class="url-item-original">${u.original_url}</div>
      <div class="url-item-stats">Кліків: ${u.hits} | Створено: ${new Date(u.created_at).toLocaleString()}</div>
    `;
    list.appendChild(li);
  });
}
