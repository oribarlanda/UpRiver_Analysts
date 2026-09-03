/* UpRiver service worker: intentionally no caching, only Web Push events. */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const bodies = {
    schedule_published: "השיבוץ לשבוע הבא פורסם 🎉",
    schedule_updated: "השיבוץ שלך עודכן",
  };
  const body = bodies[payload.type];
  if (!body) return;

  event.waitUntil(
    self.registration.showNotification("UpRiver", {
      body,
      icon: "/icons/upriver-192.png",
      badge: "/icons/upriver-192.png",
      data: { url: payload.url || "/" },
      tag: `${payload.type}:${payload.weekStart || "general"}`,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let targetUrl;
  try {
    targetUrl = new URL(event.notification.data?.url || "/", self.location.origin);
    if (targetUrl.origin !== self.location.origin) {
      targetUrl = new URL("/", self.location.origin);
    }
  } catch {
    targetUrl = new URL("/", self.location.origin);
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const existing = windowClients[0];
        if (existing) {
          if ("navigate" in existing) await existing.navigate(targetUrl.href);
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl.href);
      })
  );
});
