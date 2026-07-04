import { createContext, useContext } from "react";
import { crypto } from "mtp";

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

export default function Provider(props: { children: React.ReactNode }) {
  return (
    <context.Provider
      value={{
        decrypt: crypto.decrypt,
        encrypt: crypto.encrypt,
        decryptText: crypto.decryptText,
        encryptText: crypto.encryptText,
        getSharedSecret: crypto.getSharedSecret,
      }}
    >
      {props.children}
    </context.Provider>
  );
}

export function useCrypto(): CryptoContextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useCrypto must be used within a CryptoProvider");
  }
  return ctx;
}
