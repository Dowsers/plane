/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") - this
 * file previously held a Workbox precache/runtime-caching artifact
 * generated before this app moved off Next.js, but it was never actually
 * registered anywhere (confirmed: zero `serviceWorker.register()` calls
 * existed anywhere in `apps/web`'s source), so its `NetworkFirst`/
 * `NetworkOnly` routes had never once run in a real browser. Replaced
 * outright with a real, minimal service worker whose only job is Web
 * Push: receive a `push` event, show a system notification, and route a
 * click on it back into the app. No caching/offline behavior is
 * implemented here - that's a deliberately separate concern (category 12
 * feature 4, offline sync), not something this feature should bundle in
 * as a side effect of needing *some* service worker registered.
 *
 * Registered on-demand - not unconditionally at every app boot - from
 * `@/lib/push-notifications`'s `subscribeToWebPush`, the first time a
 * user turns on push from Profile > Notifications. An instance that
 * hasn't configured push (or a browser without Push API support) never
 * causes a service worker to be installed at all.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Payload shape sent by the backend
 * (`plane.bgtasks.push_notification_task.send_web_push_to_subscription`):
 * `{"title": "...", "body": "...", "url": "..."}`. `url` is always an
 * app-relative path (e.g.
 * `/{workspaceSlug}/projects/{projectId}/issues/{issueId}/`), never an
 * absolute URL - resolved against this service worker's own origin in
 * the `notificationclick` handler below.
 */
self.addEventListener("push", (event) => {
  let data = { title: "Plane", body: "You have a new notification.", url: "/" };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_error) {
      // Not JSON (should never happen for anything this fork's own
      // backend sends) - fall back to the raw text as the body rather
      // than dropping the notification entirely.
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: data.url },
    })
  );
});

/**
 * Focuses an already-open tab on the target URL if one exists, otherwise
 * opens a new one - standard Web Push boilerplate. This app is always
 * served from its origin's root (every internal navigation elsewhere in
 * this codebase already builds root-relative paths the same way), so the
 * payload's `url` only ever needs resolving against `self.location.origin`.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
