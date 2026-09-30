const CACHE_NAME = 'nqn-service-v938-cierre-z-loader';
const APP_SHELL = [
  './',
  './index.html',
  './NQN_SERVICE_ESTABLE.html',
  './manifest.webmanifest',
  './turnos.js',
  './cierre-z.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

function injectCierreZ(html) {
  if (html.includes('src="./cierre-z.js"') || html.includes("src='./cierre-z.js'")) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', '<script src="./cierre-z.js"></script>\n</body>');
  }
  return html + '\n<script src="./cierre-z.js"></script>\n';
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response || !response.ok) throw new Error('network');
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    const html = injectCierreZ(await response.text());
    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/html; charset=utf-8');

    const modified = new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

    const cache = await caches.open(CACHE_NAME);
    cache.put(request, modified.clone()).catch(() => {});
    cache.put('./index.html', modified.clone()).catch(() => {});
    return modified;
  } catch (e) {
    const cached = await caches.match(request) || await caches.match('./index.html');
    if (!cached) throw e;
    const type = cached.headers.get('content-type') || '';
    if (!type.includes('text/html')) return cached;
    const html = injectCierreZ(await cached.text());
    return new Response(html, {
      status: 200,
      headers: {'content-type': 'text/html; charset=utf-8'}
    });
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(APP_SHELL.map(async url => {
        try {
          const r = await fetch(url, { cache: 'reload' });
          if (r && r.ok) await cache.put(url, r.clone());
        } catch (e) {}
      }))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME && key.startsWith('nqn-service-'))
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
