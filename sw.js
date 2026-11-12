'use strict';

/* Service worker: guarda os arquivos do app para abrir rápido e sem internet.
   - Arquivos do próprio app: sempre tenta a versão mais nova; sem internet, usa a guardada.
   - Bibliotecas com versão fixa (Firebase, fontes): usa a guardada, porque nunca mudam.
   Os dados quem guarda é o próprio Firebase, no aparelho.
   Ao publicar uma versão nova, aumente o número em CACHE. */

const CACHE = 'treino-junto-v4';
const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2';
const FILES = [
  './',
  './index.html',
  './style.css',
  './firebase-config.js',
  './store.js',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  `${FIREBASE}/firebase-app.js`,
  `${FIREBASE}/firebase-auth.js`,
  `${FIREBASE}/firebase-firestore.js`,
  `${FIREBASE}/firebase-messaging.js`,
];
const EXTERNOS = [FIREBASE, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

const guardar = (request, response) => {
  if (!response.ok) return response;
  const copia = response.clone();
  caches.open(CACHE).then(cache => cache.put(request, copia));
  return response;
};

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin === location.origin) {
    event.respondWith(fetch(request, { cache: 'no-cache' }).then(r => guardar(request, r)).catch(() => caches.match(request)));
  } else if (EXTERNOS.some(base => request.url.startsWith(base))) {
    event.respondWith(caches.match(request).then(g => g || fetch(request).then(r => guardar(request, r))));
  }
  // Banco de dados e login passam direto
});

// ---------- Avisos no celular ----------
// O script de avisos manda { titulo, corpo, url }; aqui vira a notificação, mesmo com o app fechado.
self.addEventListener('push', event => {
  let m = {};
  try {
    const recebido = event.data ? event.data.json() : {};
    m = recebido.data ?? recebido;
  } catch {
    m = { corpo: event.data?.text() };
  }
  event.waitUntil(self.registration.showNotification(m.titulo || 'Treino Junto', {
    body: m.corpo || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: m.tag || undefined, // avisos com a mesma tag substituem o anterior em vez de empilhar
    data: { url: m.url || self.registration.scope },
  }));
});

// Tocar na notificação abre o app na aba certa (ou traz para frente, se já estiver aberto)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
      const aberta = janelas.find(j => j.url.startsWith(self.registration.scope));
      if (aberta) { aberta.postMessage({ abrir: url }); return aberta.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
