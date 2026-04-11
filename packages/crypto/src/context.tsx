import * as React from "react";
import * as Comlink from "comlink";

type CryptoContextType = {
  decrypt: (secret: string, ciphertext: string) => Promise<string>;
  encrypt: (secret: string, plaintext: string) => Promise<string>;
  getSharedSecret: (
    ownPrivateKey: string,
    ownPublicKey: string,
    otherPublicKey: string,
  ) => Promise<string>;
};

type ApiRef = {
  encrypt: (secret: string, plaintext: string) => Promise<string>;
  decrypt: (secret: string, ciphertext: string) => Promise<string>;
  getSharedSecret: (
    ownPrivateKey: string,
    ownPublicKey: string,
    otherPublicKey: string,
  ) => Promise<string>;
};

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
   * Encrypts plaintext by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param plaintext Plaintext to encrypt.
   * @returns Encrypted ciphertext.
   */
  const encrypt = async (
    secret: string,
    plaintext: string,
  ): Promise<string> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.encrypt(secret, plaintext);
  };

  /**
   * Decrypts ciphertext by delegating to the crypto worker API.
   * @param secret Hex-encoded shared secret.
   * @param ciphertext Ciphertext to decrypt.
   * @returns Decrypted plaintext.
   */
  const decrypt = async (
    secret: string,
    ciphertext: string,
  ): Promise<string> => {
    const api = getApiRef();
    if (!api) throw new Error("API not initialized");
    return await api.decrypt(secret, ciphertext);
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

  return { encrypt, decrypt, getSharedSecret };
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
