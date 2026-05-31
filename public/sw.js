/* Líquen Events — Service Worker
   Handles installability and Web Push notifications for the back-office. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
