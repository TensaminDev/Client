const textEncoder = new TextEncoder();

export const ENCRYPTED_DEVICE_SECRET_WRAPPING_SCHEME =
  "webcrypto-aes-gcm-hkdf-sha256-v1";

export async function wrapDeviceSecret(args: {
  rawSecret: Uint8Array;
  wrappingSecret: Uint8Array | string;
  userId: string;
  deviceId: string;
  secretId: string;
  version: number;
}): Promise<{
  encryptedSecret: Uint8Array;
  wrappingScheme: string;
  wrappingPublicKeyId?: string;
}> {
  if (!args.rawSecret.length) {
    throw new Error("rawSecret must not be empty");
  }

  const key = await deriveWrappingKey(args);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = metadataAad(args);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ownedBytes(iv), additionalData: ownedBytes(aad) },
      key,
      ownedBytes(args.rawSecret),
    ),
  );

  const encryptedSecret = new Uint8Array(iv.length + ciphertext.length);
  encryptedSecret.set(iv, 0);
  encryptedSecret.set(ciphertext, iv.length);

  return {
    encryptedSecret,
    wrappingScheme: ENCRYPTED_DEVICE_SECRET_WRAPPING_SCHEME,
  };
}

export async function unwrapDeviceSecret(args: {
  encryptedSecret: Uint8Array;
  wrappingSecret: Uint8Array | string;
  userId: string;
  deviceId: string;
  secretId: string;
  version: number;
  wrappingScheme: string;
}): Promise<Uint8Array> {
  if (args.wrappingScheme !== ENCRYPTED_DEVICE_SECRET_WRAPPING_SCHEME) {
    throw new Error(
      `Unsupported encrypted device secret wrapping scheme: ${args.wrappingScheme}`,
    );
  }
  if (args.encryptedSecret.length <= 12) {
    throw new Error("encryptedSecret is too short");
  }

  const key = await deriveWrappingKey(args);
  const iv = args.encryptedSecret.slice(0, 12);
  const ciphertext = args.encryptedSecret.slice(12);
  const aad = metadataAad(args);

  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBytes(iv), additionalData: ownedBytes(aad) },
      key,
      ownedBytes(ciphertext),
    ),
  );
}

async function deriveWrappingKey(args: {
  wrappingSecret: Uint8Array | string;
  userId: string;
  deviceId: string;
  secretId: string;
  version: number;
}): Promise<CryptoKey> {
  const wrappingSecret =
    typeof args.wrappingSecret === "string"
      ? textEncoder.encode(args.wrappingSecret)
      : args.wrappingSecret;

  if (wrappingSecret.length < 16) {
    throw new Error("No secure wrapping key available");
  }

  const baseKey = await crypto.subtle.importKey(
    "raw",
    ownedBytes(wrappingSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: ownedBytes(textEncoder.encode("tensamin-e2ee-device-secret-v1")),
      info: ownedBytes(metadataAad(args)),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

function metadataAad(args: {
  userId: string;
  deviceId: string;
  secretId: string;
  version: number;
}): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      userId: args.userId,
      deviceId: args.deviceId,
      secretId: args.secretId,
      version: args.version,
    }),
  );
}
