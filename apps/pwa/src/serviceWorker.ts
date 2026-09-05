/// <reference lib="webworker" />

import { base64ToBytes } from "mtp";
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";
import { CacheFirst } from "workbox-strategies";

import { decryptChatText, unwrapChatSecret } from "@tensamin/crypto/chatSecret";
import { loadSecureBrowserValue } from "@tensamin/storage/browserSecure";

declare let self: ServiceWorkerGlobalScope;

type PushPayload = {
  version: 1;
  senderId: number;
  sender: string;
  avatar?: string;
  message: { content: string; versionNumber?: number };
  secret: {
    chatId: string;
    secretId: string;
    version: number;
    encryptedSecret: string;
    kemCiphertext: string;
    wrappingScheme: string;
  };
};

function isPushPayload(value: unknown): value is PushPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PushPayload>;
  const message = payload.message as
    Partial<PushPayload["message"]> | undefined;
  const secret = payload.secret as Partial<PushPayload["secret"]> | undefined;
  const stringValues = [
    payload.sender,
    message?.content,
    secret?.chatId,
    secret?.secretId,
    secret?.encryptedSecret,
    secret?.kemCiphertext,
    secret?.wrappingScheme,
  ];
  return (
    payload.version === 1 &&
    typeof payload.senderId === "number" &&
    Number.isSafeInteger(payload.senderId) &&
    payload.senderId > 0 &&
    typeof secret?.version === "number" &&
    stringValues.every((item) => typeof item === "string")
  );
}

async function decryptPush(payload: PushPayload) {
  const keyring = await loadSecureBrowserValue<string>("mtp_keyring");
  if (!keyring) throw new Error("MTP credentials are unavailable.");
  const chatSecret = await unwrapChatSecret({
    encryptedSecret: base64ToBytes(payload.secret.encryptedSecret),
    kemCiphertext: base64ToBytes(payload.secret.kemCiphertext),
    keyring,
    chatId: payload.secret.chatId,
    secretId: payload.secret.secretId,
    version: payload.secret.version,
    wrappingScheme: payload.secret.wrappingScheme,
  });
  try {
    return await decryptChatText(
      chatSecret,
      payload.message.content,
      payload.message.versionNumber ?? payload.secret.version,
    );
  } finally {
    chatSecret.fill(0);
  }
}

clientsClaim();
cleanupOutdatedCaches();
const precacheManifest = self.__WB_MANIFEST;
precacheAndRoute(precacheManifest);

if (
  precacheManifest.some((entry) =>
    (typeof entry === "string" ? entry : entry.url).endsWith("index.html"),
  )
) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("index.html"), {
      denylist: [/^\/api\//],
    }),
  );
}
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    ["font", "image", "style"].includes(request.destination),
  new CacheFirst({ cacheName: "tensamin-static-v1" }),
);

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload: PushPayload | undefined;
      try {
        const value = event.data?.json() as unknown;
        if (isPushPayload(value)) payload = value;
      } catch {
        // The generic notification below is safe for malformed payloads.
      }

      let body = "Open Tensamin to view the encrypted message.";
      if (payload) {
        try {
          body = await decryptPush(payload);
        } catch {
          // Do not leak credential or decryption failures in the notification.
        }
      }

      await self.registration.showNotification(payload?.sender ?? "Tensamin", {
        body,
        icon: payload?.avatar || "./icons/icon-192.png",
        badge: "./icons/notification-badge.png",
        tag: payload ? `message-${payload.senderId}` : "message",
        data: { url: payload ? `/chat?id=${payload.senderId}` : "/" },
      });

      const navigatorWithBadge = self.navigator as WorkerNavigator & {
        setAppBadge?: (contents?: number) => Promise<void>;
      };
      await navigatorWithBadge.setAppBadge?.().catch(() => undefined);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = new URL(
        String(
          (event.notification.data as { url?: string } | undefined)?.url ?? "/",
        ),
        self.location.origin,
      );
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("navigate" in client) await client.navigate(target.href);
        return client.focus();
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
