/*
 * Rifa App · service worker de shell (decisão 6, PWA instalável).
 * Escopo mínimo: cache precioso do shell para recarga offline (PB-7).
 * Sem fila offline de gravações na v1 (F7) — banners bloqueiam gravação na UI.
 */
const VERSAO_CACHE = "rifa-shell-v1";
const RECURSOS_DO_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSAO_CACHE).then((cache) => cache.addAll(RECURSOS_DO_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((chave) => chave !== VERSAO_CACHE).map((chave) => caches.delete(chave)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const { request } = evento;

  // Nunca intercepta gravações (POST/PUT/PATCH/DELETE) nem chamadas do Supabase.
  const metodoSeguro = request.method === "GET";
  const url = new URL(request.url);
  const origemPropria = url.origin === self.location.origin;

  if (!metodoSeguro || !origemPropria) return;

  // Cache-first só para o shell; navegações usam network-first com fallback.
  if (request.mode === "navigate") {
    evento.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(VERSAO_CACHE).then((cache) => cache.put("/", copia));
          return resposta;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  evento.respondWith(caches.match(request).then((emCache) => emCache ?? fetch(request)));
});
