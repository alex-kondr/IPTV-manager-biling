const CACHE_NAME = 'homehub-v4';
const META_CACHE_NAME = 'homehub-sw-meta-v1';
const ASSETS_TO_CACHE = [
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
  '/icons/icon.svg',
  '/favicon.ico',
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
        keys
          .filter((key) => key !== CACHE_NAME && key !== META_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Network-first with cache fallback for assets & navigation
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
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
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      })
  );
});

function buildNotificationOptions(payload) {
  return {
    body: payload.body || 'Оновлено погодинний графік відключень світла ДТЕК.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    tag: payload.tag || 'dtek-schedule-change-' + Date.now(),
    renotify: true,
    silent: false,
    vibrate: [250, 100, 250, 100, 400],
    timestamp: Date.now(),
    data: {
      url: payload.url || '/?tab=outage_schedule',
      title: payload.title || '⚡ Зміна графіку відключень ДТЕК',
      body: payload.body || '',
      queueGroup: payload.queueGroup || '',
    },
    actions: [
      { action: 'open', title: 'Відкрити графік' },
      { action: 'snooze_15m', title: 'Нагадати +15 хв' },
    ],
  };
}

// Allow the Angular app to trigger native Android drawer notifications via ServiceWorker
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SHOW_NOTIFICATION' && data.payload) {
    const title = data.payload.title || '⚡ Зміна графіку відключень ДТЕК';
    const options = buildNotificationOptions(data.payload);
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Background Web Push Notification Dispatcher (VAPID)
self.addEventListener('push', (event) => {
  let payload = {
    title: '⚡ Зміна графіку відключень ДТЕК',
    body: 'Оновлено погодинний графік відключень світла за вашою чергою.',
    tag: 'dtek-schedule-change-' + Date.now(),
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

  const options = buildNotificationOptions(payload);

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (const client of windowClients) {
          client.postMessage({
            type: 'DTEK_PUSH_RECEIVED',
            payload,
          });
        }
      }),
    ])
  );
});

// Periodic Background Sync (Android Chrome / PWA when installed)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'dtek-schedule-check') {
    event.waitUntil(checkScheduleChangesInBackground());
  }
});

async function checkScheduleChangesInBackground() {
  try {
    const resp = await fetch('/api/push/changes', { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const changes = Array.isArray(data?.changes) ? data.changes : [];
    if (changes.length === 0) return;

    const latest = changes[0];
    const cache = await caches.open(META_CACHE_NAME);
    const prevResp = await cache.match('/__last_notified_change_id');
    const prevId = prevResp ? await prevResp.text() : '';

    if (latest && latest.id && latest.id !== prevId) {
      await cache.put('/__last_notified_change_id', new Response(String(latest.id)));
      await self.registration.showNotification(
        latest.title || '⚡ Зміна графіку відключень ДТЕК',
        buildNotificationOptions({
          title: latest.title,
          body: latest.body,
          tag: `dtek-bg-${latest.id}`,
          url: '/?tab=outage_schedule',
          queueGroup: latest.queueKey || '',
        })
      );
    }
  } catch {
    // Ignore background network error
  }
}

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
          body: data.body || 'Минуло 15 хвилин. Перевірте актуальний графік відключень світла.',
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
