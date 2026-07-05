import { createContext, useContext } from "react";
import { base64ToBytes, bytesToBase64, crypto } from "mtp";

type CryptoContextType = {
  decrypt: (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  decryptText: (secret: string, ciphertext: string) => Promise<string>;
  encrypt: (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  encryptText: (secret: string, plaintext: string) => Promise<string>;
  getSharedSecret: (
    ownPrivateKey: string,
    ownPublicKey: string,
    otherPublicKey: string,
  ) => Promise<string>;
};

export const context = createContext<CryptoContextType | undefined>(undefined);

export function createCryptoActions(
  getApi: () => CryptoContextType | null | undefined,
): CryptoContextType {
  const requireApi = () => {
    const api = getApi();
    if (!api) {
      throw new Error("Crypto API not initialized");
    }
    return api;
  };

  return {
    decrypt: (secret, input) => requireApi().decrypt(secret, input),
    decryptText: (secret, ciphertext) =>
      requireApi().decryptText(secret, ciphertext),
    encrypt: (secret, input) => requireApi().encrypt(secret, input),
    encryptText: (secret, plaintext) =>
      requireApi().encryptText(secret, plaintext),
    getSharedSecret: (ownPrivateKey, ownPublicKey, otherPublicKey) =>
      requireApi().getSharedSecret(ownPrivateKey, ownPublicKey, otherPublicKey),
  };
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

function secretKeyFromString(secret: string): Uint8Array {
  return crypto.deriveEncryptionKey(
    base64ToBytes(secret),
    new Uint8Array(0),
    new TextEncoder().encode("tensamin:shared-secret-text"),
  );
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.byteLength, b.byteLength);

  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    if (diff !== 0) return diff;
  }

  return a.byteLength - b.byteLength;
}

async function getSharedSecret(
  ownPrivateKey: string,
  ownPublicKey: string,
  otherPublicKey: string,
): Promise<string> {
  crypto.keyringToKeys(ownPrivateKey);

  const ownKeys = crypto.publicKeyBundleToKeys(ownPublicKey);
  const otherKeys = crypto.publicKeyBundleToKeys(otherPublicKey);
  const publicKeys = [ownKeys.kemPublicKey, otherKeys.kemPublicKey].sort(
    compareBytes,
  );
  const input = new Uint8Array(
    publicKeys[0].byteLength + publicKeys[1].byteLength,
  );

  input.set(publicKeys[0]);
  input.set(publicKeys[1], publicKeys[0].byteLength);

  return bytesToBase64(
    crypto.deriveEncryptionKey(
      input,
      new Uint8Array(0),
      new TextEncoder().encode("tensamin:legacy-shared-secret"),
    ),
  );
}

export default function Provider(props: { children: React.ReactNode }) {
  const actions = createCryptoActions(() => ({
    decrypt: async (secret, input) =>
      ownedBytes(await crypto.decrypt(secretKeyFromString(secret), input)),
    decryptText: (secret, ciphertext) =>
      crypto.decryptText(secretKeyFromString(secret), ciphertext),
    encrypt: async (secret, input) =>
      ownedBytes(await crypto.encrypt(secretKeyFromString(secret), input)),
    encryptText: (secret, plaintext) =>
      crypto.encryptText(secretKeyFromString(secret), plaintext),
    getSharedSecret,
  }));

  return <context.Provider value={actions}>{props.children}</context.Provider>;
}

export function useCrypto(): CryptoContextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCrypto must be used within a CryptoProvider");
  }
  return ctx;
}
