const CACHE_NAME = 'iptv-billing-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/icon.svg',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass all /api/ requests straight to network
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network-first with cache fallback for HTML/assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Network error occurred', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});

// Background Web Push Notification Dispatcher (VAPID)
self.addEventListener('push', (event) => {
  let payload = {
    title: '⚡ Зміна графіку відключень ДТЕК',
    body: 'Оновлено погодинний графік відключень світла за вашою чергою.',
    tag: 'dtek-schedule-change',
    url: '/?tab=outage_schedule',
    queueGroup: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: payload.tag || 'dtek-schedule-change',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 350],
    data: {
      url: payload.url || '/?tab=outage_schedule',
      title: payload.title,
      body: payload.body,
      queueGroup: payload.queueGroup || '',
    },
    actions: [
      { action: 'open', title: 'Відкрити' },
      { action: 'snooze_15m', title: 'Відкласти +15 хв' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  notification.close();

  if (action === 'snooze_15m') {
    event.waitUntil(
      fetch('/api/push/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delayMinutes: 15,
          title: data.title || '⚡ Нагадування: Графік відключень ДТЕК',
          body: data.body || 'Перевірте актуальний графік відключень світла.',
          queueGroup: data.queueGroup || '',
        }),
      }).catch(() => {})
    );
    return;
  }

  const targetUrl = data.url || '/?tab=outage_schedule';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'OPEN_TAB', tab: 'outage_schedule' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
