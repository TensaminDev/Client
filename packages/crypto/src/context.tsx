import * as React from "react";
import * as Comlink from "comlink";

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

type ApiRef = {
  encrypt: (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  decrypt: (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  decryptText: (secret: string, ciphertext: string) => Promise<string>;
  encryptText: (secret: string, plaintext: string) => Promise<string>;
  getSharedSecret: (
    ownPrivateKey: string,
    ownPublicKey: string,
    otherPublicKey: string,
  ) => Promise<string>;
};

export function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const context = React.createContext<CryptoContextType | undefined>(
  undefined,
);

/**
 * Provides cryptographic actions backed by a worker without coupling to UI state.
 * @param props Component props with children.
 * @returns Crypto context provider JSX.
 */
export default function Provider(props: { children: React.ReactNode }) {
  const apiRef = React.useRef<ApiRef | null>(null);

  const value = React.useMemo<CryptoContextType>(
    () => ({
      encrypt: async (secret, plaintext) => {
        const api = apiRef.current;
        if (!api) throw new Error("API not initialized");
        return await api.encrypt(secret, plaintext);
      },
      decrypt: async (secret, ciphertext) => {
        const api = apiRef.current;
        if (!api) throw new Error("API not initialized");
        return await api.decrypt(secret, ciphertext);
      },
      encryptText: async (secret, plaintext) => {
        const api = apiRef.current;
        if (!api) throw new Error("API not initialized");
        return await api.encryptText(secret, plaintext);
      },
      decryptText: async (secret, ciphertext) => {
        const api = apiRef.current;
        if (!api) throw new Error("API not initialized");
        return await api.decryptText(secret, ciphertext);
      },
      getSharedSecret: async (ownPrivateKey, ownPublicKey, otherPublicKey) => {
        const api = apiRef.current;
        if (!api) throw new Error("API not initialized");
        return await api.getSharedSecret(
          ownPrivateKey,
          ownPublicKey,
          otherPublicKey,
        );
      },
    }),
    [],
  );

  React.useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    apiRef.current = Comlink.wrap<ApiRef>(worker);

    return () => {
      apiRef.current = null;
      worker.terminate();
    };
  }, []);

  return <context.Provider value={value}>{props.children}</context.Provider>;
}

/**
 * Creates crypto action functions that safely delegate to the worker API.
 * @param getApiRef Function that returns the worker API reference.
 * @returns Typed crypto action functions.
 */
export function createCryptoActions(
  getApiRef: () => ApiRef | null,
): CryptoContextType {
  /**
   * Encrypts bytes by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param input Plaintext bytes to encrypt.
   * @returns Ciphertext bytes.
   */
  const encrypt = async (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.encrypt(secret, input);
  };

  /**
   * Decrypts bytes by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param input Ciphertext bytes to decrypt.
   * @returns Plaintext bytes.
   */
  const decrypt = async (
    secret: string,
    input: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.decrypt(secret, input);
  };

  /**
   * Encrypts plaintext text by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param plaintext Plaintext to encrypt.
   * @returns Base64 ciphertext.
   */
  const encryptText = async (
    secret: string,
    plaintext: string,
  ): Promise<string> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.encryptText(secret, plaintext);
  };

  /**
   * Decrypts base64 ciphertext text by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param ciphertext Base64 ciphertext to decrypt.
   * @returns Decrypted plaintext.
   */
  const decryptText = async (
    secret: string,
    ciphertext: string,
  ): Promise<string> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.decryptText(secret, ciphertext);
  };

  /**
   * Derives a shared secret from local and peer key material via the worker API.
   * @param ownPrivateKey Local private key.
   * @param ownPublicKey Local public key.
   * @param otherPublicKey Peer public key.
   * @returns Hex-encoded shared secret.
   */
  const getSharedSecret = async (
    ownPrivateKey: string,
    ownPublicKey: string,
    otherPublicKey: string,
  ): Promise<string> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.getSharedSecret(
      ownPrivateKey,
      ownPublicKey,
      otherPublicKey,
    );
  };

  return { encrypt, decrypt, encryptText, decryptText, getSharedSecret };
}

/**
 * Returns the crypto actions from the nearest provider.
 * Throws when used outside of the crypto provider tree.
 */
export function useCrypto(): CryptoContextType {
  const ctx = React.useContext(context);
  if (!ctx) {
    throw new Error("useCrypto must be used within a CryptoProvider");
  }
  return ctx;
}
