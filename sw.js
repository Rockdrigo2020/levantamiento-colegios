// sw.js — Service Worker LevantApp PWA
// v4: network-first para HTML (evita quedarse pegado en versión vieja),
//     cache-first para assets estáticos, bypass total de Apps Script.
// v5: agrega Bodega, Emergencias (FAB global), Gestión y control y Analítica IA.
//     Sin cambios en la estrategia de cache: las libs de Analítica (SheetJS/Chart.js,
//     cdnjs.cloudflare.com) ya caen en la rama "Assets" cache-first genérica de abajo,
//     así que quedan disponibles offline después del primer uso online.
// v6: BASE se calcula desde self.registration.scope en vez de venir hardcodeado a
//     /levantamiento-colegios/ — así el sitio funciona sin cambios sin importar en qué
//     carpeta/dominio lo publique IT (ej. www.empresa.cl/levantapp/).
// v7: iconos del manifest pasan de SVG embebido a PNG reales (icon-192/512/512-maskable),
//     requisito de PWABuilder para empaquetar como APK/AAB — se agregan al precache.
const CACHE = 'levantapp-v7';
const BASE = self.registration.scope;
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'icon-512-maskable.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Permite forzar activación desde la página
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nunca interceptar el backend ni Drive
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('drive.google.com')) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first: siempre intenta la versión nueva, cae al cache si no hay red
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'index.html')))
    );
    return;
  }

  // Assets: cache-first, y guarda lo nuevo que se descargue (incl. fuentes)
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
