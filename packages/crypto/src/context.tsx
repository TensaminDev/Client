import { createContext, useContext } from "react";
import { base64ToBytes, crypto } from "mtp";

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
