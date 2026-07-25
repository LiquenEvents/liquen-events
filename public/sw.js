/* Líquen Events — Service Worker
   Two jobs:
   1. Web Push notifications for the back-office (push/notificationclick).
   2. A conservative offline cache for the public marketing site.

   Caching posture is deliberately safe: NAVIGATIONS are network-first (online
   visitors always get fresh HTML; the cache only steps in when offline), and
   only content-hashed static assets + images are cache-first. The API and the
   whole /orcamento surface (auth'd back office + live quote flow) are never
   touched, so nothing dynamic is ever served stale. Bump CACHE to invalidate. */

const CACHE = "liquen-cache-v1";

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
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
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
    url.pathname.startsWith("/en/orcamento")
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
