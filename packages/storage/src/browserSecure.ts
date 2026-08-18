import { getDatabaseEntry } from "@tensamin/shared/indexedDb";

type SecureEnvelope = {
  __tensaminSecure: 1;
  version: 1;
  iv: string;
  data: string;
};

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isSecureEnvelope(value: unknown): value is SecureEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<SecureEnvelope>;
  return (
    envelope.__tensaminSecure === 1 &&
    envelope.version === 1 &&
    typeof envelope.iv === "string" &&
    typeof envelope.data === "string"
  );
}

export async function loadSecureBrowserValue<T>(key: string) {
  const stored = await getDatabaseEntry<unknown>("storage", key);
  if (stored === undefined || !isSecureEnvelope(stored)) {
    return stored as T | undefined;
  }

  const masterKey = await getDatabaseEntry<CryptoKey>("keys", "master-v1");
  if (!masterKey) throw new Error("Secure storage key is unavailable.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(stored.iv) },
    masterKey,
    base64ToBytes(stored.data),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
