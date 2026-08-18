# Web Push Backend TODO

The client can subscribe and decrypt version 1 push payloads, but reliable delivery requires backend support.

- Generate and securely store a VAPID key pair. Expose only the public key to the web build as `VITE_WEB_PUSH_PUBLIC_KEY`.
- Add authenticated MTP requests for registering, replacing, and deleting a browser `PushSubscription` per user and installation.
- Persist the endpoint, `p256dh`, `auth`, expiration time, stable installation ID, and last-seen time.
- Remove subscriptions when a push service returns HTTP 404 or 410 and rate-limit registrations per user.
- Send pushes when an encrypted live message cannot be delivered to an active browser client. Define duplicate suppression for clients that receive both MTP and Web Push.
- Keep the JSON payload within push-provider limits and use this version 1 shape:

```json
{
  "version": 1,
  "senderId": 123,
  "sender": "Display name",
  "avatar": "https://optional.example/avatar",
  "message": { "content": "base64 encrypted message content" },
  "secret": {
    "chatId": "123:456",
    "secretId": "chat:123:456:main",
    "version": 1,
    "encryptedSecret": "base64 wrapped chat secret",
    "kemCiphertext": "base64 KEM ciphertext",
    "wrappingScheme": "mtp-chat-secret-kem-chacha20poly1305-hkdf-sha256-v1"
  }
}
```

- Ensure the wrapped secret is intended for the receiving user's MTP keyring. The server must never receive plaintext message content or plaintext chat secrets.
- Decide how edits, deletions, reactions, calls, read states, and per-chat notification cancellation map to push events.
- Add subscription rotation handling and unregister subscriptions when a user logs out or clears application data.
- Configure production HTTPS, SPA route fallback, `application/manifest+json` for `manifest.json`, and `Cache-Control: no-cache` for the service worker.
