self.addEventListener("push", (event) => {
  const message = event.data ? event.data.json() : {};
  const notification = message.notification || {};
  const count = Number.isInteger(message.count) ? message.count : 0;
  event.waitUntil((async () => {
    await self.registration.showNotification(notification.title || message.title || "Household chores", {
      body: notification.body || message.body || "You have chores to check today.",
      icon: notification.icon || "/icon-192.png",
      badge: "/icon-192.png",
      tag: notification.tag || message.tag || "daily-chores",
      silent: false,
      data: { url: notification.navigate || message.url || "/" },
    });
    try {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visibleWindows = windows.filter((client) => client.visibilityState === "visible");
      if (visibleWindows.length) {
        for (const client of visibleWindows) client.postMessage({ type: "household:push" });
      } else if (self.navigator.setAppBadge && self.navigator.clearAppBadge) {
        if (count > 0) await self.navigator.setAppBadge(count);
        else await self.navigator.clearAppBadge();
      }
    } catch (error) {
      console.warn("Notification displayed; badge or app refresh failed.", error);
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge().catch(() => {});
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.length) {
      windows[0].postMessage({ type: "household:push" });
      return windows[0].focus();
    }
    return self.clients.openWindow(event.notification.data?.url || "/");
  })());
});
