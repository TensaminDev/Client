import { describe, expect, test } from "bun:test";
import { createCryptoActions } from "./context";

/**
 * Creates a rejected API getter used to verify initialization guards.
 * @returns Null API reference.
 */
function getUninitializedApi(): null {
  return null;
}

describe("createCryptoActions", () => {
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  test("throws when API is not initialized", async () => {
    const actions = createCryptoActions(getUninitializedApi);

    let failed = false;
    try {
      await actions.encrypt("ab", new TextEncoder().encode("plain"));
    } catch (error) {
      failed = (error as Error).message.includes("API not initialized");
    }

    expect(failed).toBe(true);
  });

  test("delegates encrypt/decrypt/getSharedSecret to API reference", async () => {
    const api = {
      encrypt: async (
        secret: string,
        input: Uint8Array<ArrayBuffer>,
      ): Promise<Uint8Array<ArrayBuffer>> =>
        textEncoder.encode(`${secret}:${textDecoder.decode(input)}`),
      decrypt: async (
        secret: string,
        input: Uint8Array<ArrayBuffer>,
      ): Promise<Uint8Array<ArrayBuffer>> =>
        textEncoder.encode(`${secret}|${textDecoder.decode(input)}`),
      encryptText: async (secret: string, plaintext: string): Promise<string> =>
        `${secret}:${plaintext}`,
      decryptText: async (
        secret: string,
        ciphertext: string,
      ): Promise<string> => `${secret}|${ciphertext}`,
      getSharedSecret: async (
        ownPrivateKey: string,
        ownPublicKey: string,
        otherPublicKey: string,
      ): Promise<string> =>
        `${ownPrivateKey}.${ownPublicKey}.${otherPublicKey}`,
    };

    const actions = createCryptoActions(() => api);

    expect(
      textDecoder.decode(await actions.encrypt("s", textEncoder.encode("p"))),
    ).toBe("s:p");
    expect(
      textDecoder.decode(await actions.decrypt("s", textEncoder.encode("c"))),
    ).toBe("s|c");
    expect(await actions.encryptText("s", "p")).toBe("s:p");
    expect(await actions.decryptText("s", "c")).toBe("s|c");
    expect(await actions.getSharedSecret("a", "b", "c")).toBe("a.b.c");
  });
});
