/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TPushSubscriptionCreatePayload } from "@plane/types";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 ("Notifications push en self-hosted") -
 * browser-side Web Push helpers: VAPID key conversion, service worker
 * registration, and the exigence 1 "activation" flow (permission prompt
 * -> service worker ready -> `pushManager.subscribe()`).
 *
 * No service worker was registered anywhere in this app before this
 * feature - `public/sw.js` (see that file's own header comment) is now a
 * real push-handling service worker, registered on-demand from here
 * (not unconditionally at app boot) so an instance that hasn't configured
 * push never causes a browser to install one for nothing.
 */
const SERVICE_WORKER_URL = "/sw.js";

/**
 * Converts a base64url-encoded VAPID public key (exactly the string
 * `GET /api/instances/` returns as `config.vapid_public_key`, and the
 * shape `py_vapid`'s `b64urlencode` produces server-side, see
 * `plane.utils.vapid`) into the raw `Uint8Array`
 * `PushManager.subscribe({applicationServerKey})` requires.
 *
 * This is the well-known Web Push gotcha every implementation needs:
 * `atob()` only understands STANDARD base64 (`+`/`/`, `=`-padded), while
 * VAPID keys are base64URL (`-`/`_`, unpadded) - so `-`/`_` must be
 * swapped back to `+`/`/` and the string re-padded to a multiple of 4
 * before `atob()` can decode it at all.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Feature-detection - guards every entry point below, and is also what
 * the Profile > Notifications UI uses to decide whether to even attempt
 * the flow (a browser without Push API support should degrade the same
 * clean way as an instance with push not configured at all). */
export function isPushNotificationSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Registers (idempotent - a repeat call against the same already-
 * installed script URL just checks for byte-for-byte updates, it does
 * not reinstall) `public/sw.js` and resolves once it's active and able
 * to receive push events. */
async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  return navigator.serviceWorker.ready;
}

export type TPushSubscribeResult =
  | { status: "unsupported" }
  | { status: "permission-denied" }
  | { status: "subscribed"; payload: TPushSubscriptionCreatePayload }
  | { status: "error"; error: unknown };

/**
 * Orchestrates exigence 1's full activation flow. Never throws - every
 * failure mode (unsupported browser, denied/blocked permission, a
 * `subscribe()` rejection, an incomplete subscription object) is returned
 * as a typed result so the caller can render a clean, specific message
 * rather than a crash (the spec's own explicit callout, exigence 2's
 * sibling UX concern, for the permission-denied case specifically).
 *
 * Reuses an already-existing browser subscription for this
 * `applicationServerKey` instead of creating a duplicate one - the
 * backend's own `POST` is an idempotent upsert on `(user, endpoint)`
 * regardless, but avoiding a redundant `subscribe()` call is simply
 * cleaner.
 */
export async function subscribeToWebPush(vapidPublicKey: string): Promise<TPushSubscribeResult> {
  if (!isPushNotificationSupported()) return { status: "unsupported" };

  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return { status: "permission-denied" };

    const registration = await getReadyServiceWorkerRegistration();
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { status: "error", error: new Error("The browser returned an incomplete push subscription.") };
    }

    return {
      status: "subscribed",
      payload: {
        device_type: "WEB",
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    };
  } catch (error) {
    return { status: "error", error };
  }
}
