/* Líquen Events — Service Worker
   Two jobs:
   1. Web Push notifications for the back-office (push/notificationclick).
   2. A conservative offline cache for the public marketing site.

   Caching posture is deliberately safe: NAVIGATIONS are network-first (online
   visitors always get fresh HTML; the cache only steps in when offline), and
   only content-hashed static assets + images are cache-first. The API and the
   whole /orcamento surface (auth'd back office + live quote flow) are never
   touched, so nothing dynamic is ever served stale. Bump CACHE to invalidate. */

// v2: stop caching the private token-gated client pages (/portal, /proposta).
// Bumping the name purges any v1 cache that may already hold such a page.
const CACHE = "liquen-cache-v2";

/* ═══════════════════════════════════════════════════════════════════════════
   AS MINIATURAS DA BIBLIOTECA DE TEMAS, GUARDADAS SEM O TOKEN
   ═══════════════════════════════════════════════════════════════════════════

   O problema, medido (IMAGENS-BEFORE.md): reabrir o seletor de temas custa
   1835 ms, 9 pedidos e 188 KB — mesmo com o Storage a servir
   `Cache-Control: max-age=3600`. O cabeçalho está certo. O que o anula é o URL:

       .../theme-thumbs/terracotta/ab12….jpg?token=<JWT novo a cada assinatura>

   Token novo → URL novo → entrada de cache nova. Os bytes são os MESMOS e o
   browser volta a buscá-los.

   A cache do browser não pode fazer nada quanto a isto: para ela, dois URLs
   diferentes são dois recursos. Um service worker pode — porque escolhe a
   CHAVE. Guardando pelo caminho SEM os parâmetros, o token deixa de importar:
   a segunda abertura acerta na cache, e uma recarga da página também, que é
   coisa que a cache de módulo (`theme-picker-cache.ts`) nunca conseguiu.

   Resolve o número mais doloroso da auditoria SEM mudar propriedade de
   segurança nenhuma — o bucket continua privado e o token continua a ser
   preciso para o PRIMEIRO carregamento de cada ficheiro.

   ── O que é guardado, e o que NÃO é ──────────────────────────────────────
   Só `theme-thumbs` e `theme-micro`: as derivadas pequenas da biblioteca de
   INSPIRAÇÃO. São ~20 KB e ~2 KB, sem nome de cliente, sem data, sem nada que
   identifique alguém.

   Ficam de fora, de propósito:
   · `theme-assets` — os originais de ~576 KB. Guardá-los enchia o disco para
     servir uma vista que quase nunca os pede.
   · `proposal-assets` e `proposal-thumbs` — as fotos DE UMA proposta, ao lado
     da data e do local do casamento daquele casal. É a mesma linha que este
     ficheiro já traça ao recusar guardar `/portal` e `/proposta`: o que
     identifica um cliente não vai para disco.
   ═══════════════════════════════════════════════════════════════════════════ */
const CACHE_FOTOS = "liquen-fotos-v1";

/** Tecto de entradas. 600 miniaturas ≈ 12 MB — folgado para a biblioteca dela
 *  e longe de qualquer limite de quota. Acima disto saem as mais antigas. */
const MAX_FOTOS = 600;

/** É uma derivada pequena da biblioteca de temas, servida pelo Storage?
 *  Reconhece-se pela FORMA do caminho do Supabase, para o host não ter de
 *  estar escrito aqui (este ficheiro é estático, não passa pelo build). */
function ehFotoDaBiblioteca(url) {
  return (
    /\/storage\/v1\/object\/(sign|public)\/theme-(thumbs|micro)\//.test(url.pathname) &&
    url.pathname.endsWith(".jpg")
  );
}

/** A chave: o caminho, SEM os parâmetros. É isto, e só isto, que faz o token
 *  deixar de partir a cache. */
function chaveSemToken(url) {
  return `${url.origin}${url.pathname}`;
}

/** Deita fora as mais antigas quando passa do tecto. A Cache Storage mantém a
 *  ordem de inserção, por isso as primeiras chaves são as mais velhas. */
async function aparar(cache) {
  const chaves = await cache.keys();
  if (chaves.length <= MAX_FOTOS) return;
  await Promise.all(chaves.slice(0, chaves.length - MAX_FOTOS).map((k) => cache.delete(k)));
}

// Best-effort precache so a first-ever offline load still has a shell to show.
// Kept tiny; large heroes are cached lazily as they're requested.
const PRECACHE = ["/", "/offline.html", "/logo-liquen.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Per-item catch: a single missing URL must never fail the whole install
      // (which would stop the SW activating).
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== CACHE_FOTOS).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })()
  );
});

// Same-origin GETs we must never cache: dynamic, auth'd, or optimized on the
// fly. Everything under here goes straight to the network.
function isBypassed(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/orcamento") ||
    url.pathname.startsWith("/en/orcamento") ||
    // Private, token-gated client pages — their HTML carries personal data and
    // financials, so it must never be written to on-disk Cache Storage.
    url.pathname.startsWith("/portal") ||
    url.pathname.startsWith("/en/portal") ||
    url.pathname.startsWith("/proposta") ||
    url.pathname.startsWith("/en/proposta")
  );
}

// Content-hashed / immutable assets — safe to serve cache-first.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_img/") ||
    url.pathname.startsWith("/imagens/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|ico|mp4)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // As miniaturas da biblioteca vêm do Storage, que é OUTRA origem — por isso
  // este ramo tem de vir antes da guarda de mesma origem.
  if (ehFotoDaBiblioteca(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_FOTOS);
        const chave = chaveSemToken(url);
        const guardada = await cache.match(chave);
        if (guardada) return guardada;
        // Falhou a cache: vai à rede COM o token (é o pedido original) e
        // guarda o resultado sob a chave sem ele.
        const res = await fetch(request);
        // `res.ok` é falso numa resposta opaca (uma imagem cross-origin sem
        // CORS tem `status: 0`), e uma opaca é perfeitamente utilizável num
        // `<img>`. Recusá-la aqui deixaria a cache sempre vazia.
        if (res && (res.ok || res.type === "opaque")) {
          await cache.put(chave, res.clone());
          void aparar(cache);
        }
        return res;
      })().catch(() => fetch(request)),
    );
    return;
  }

  // Only same-origin; leave cross-origin (analytics, etc.) to the network.
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  // Navigations: network-first with a cached fallback, then the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match("/offline.html")) || (await caches.match("/"));
        })
    );
    return;
  }

  // Static assets: cache-first, revalidating in the background.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Anything else: default to the network (no respondWith).
});

// ── Web Push (back office) ──────────────────────────────────────────────────

// Incoming push → show a notification
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Líquen Events", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Líquen Events";
  const options = {
    body: data.body || "",
    icon: "/logo-liquen.png",
    badge: "/logo-liquen.png",
    tag: data.tag || "liquen",
    data: { url: data.url || "/orcamento/admin" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on a notification → focus or open the back-office
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/orcamento/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/orcamento/admin") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
