/* UpRiver service worker: intentionally no caching, only Web Push events. */
// This worker only handles notifications: activate updates even while the PWA is open.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const bodies = {
    all_preferences_confirmed: "כל העובדות סיימו למלא העדפות — אפשר ליצור שיבוץ ✅",
    schedule_published: "השיבוץ לשבוע הבא פורסם 🎉",
    schedule_updated: "השיבוץ שלך עודכן",
    preference_reminder: "תזכורת למלא ולאשר את ההעדפות לשבוע הבא 📋",
  };
  const body = payload && (bodies[payload.type] || payload.body);
  if (!body) return;

  event.waitUntil(
    self.registration.showNotification("UpRiver", {
      body,
      icon: "/icons/upriver-192.png",
      badge: "/icons/notification-badge.png",
      data: { url: payload.url || "/" },
      renotify: true,
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
