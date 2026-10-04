import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8Bytes, writeUintBE } from "../bytes";

/**
 * Credential envelope version 1, matching the shared Rust implementation:
 * the OPAQUE client export key is expanded with HKDF-SHA-256 (absent salt,
 * 32-byte key) and the canonical `.tu` bytes are sealed with
 * XChaCha20-Poly1305 under identity-binding associated data.
 */

const KEY_INFO = utf8Bytes("tensamin:opaque-export-key:credential:v1\0");
const AAD_DOMAIN = utf8Bytes("tensamin:opaque-credential-aad:v1\0");
const MAGIC = utf8Bytes("TSCRED\0\0");
const VERSION = 1;
const HEADER_LEN = 8 + 2 + 24;
const TAG_LEN = 16;
const PROFILE_ID = writeUintBE(1, 8);

export type CredentialBinding = {
  principal: string;
  iotaId: number;
  accountPublicKeySha256: Uint8Array;
};

function writeI64BE(value: number): Uint8Array {
  if (!Number.isSafeInteger(value))
    throw new RangeError("Iota ID must be a safe integer");
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(value), false);
  return out;
}

function credentialKey(exportKey: Uint8Array): Uint8Array {
  if (exportKey.length !== 64)
    throw new RangeError("Profile-1 export key must contain 64 bytes");
  return hkdf(
    sha256,
    exportKey,
    undefined,
    concatBytes(KEY_INFO, PROFILE_ID, writeUintBE(VERSION, 2)),
    32,
  );
}

function associatedData(binding: CredentialBinding): Uint8Array {
  if (binding.accountPublicKeySha256.length !== 32)
    throw new RangeError("Account fingerprint must contain 32 bytes");
  const principal = utf8Bytes(binding.principal);
  return concatBytes(
    AAD_DOMAIN,
    PROFILE_ID,
    writeUintBE(principal.byteLength, 4),
    principal,
    writeI64BE(binding.iotaId),
    binding.accountPublicKeySha256,
  );
}

export function encryptCredential(
  exportKey: Uint8Array,
  binding: CredentialBinding,
  plaintext: Uint8Array,
): Uint8Array {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(24));
  const key = credentialKey(exportKey);
  try {
    const cipher = xchacha20poly1305(key, nonce, associatedData(binding));
    return concatBytes(
      MAGIC,
      writeUintBE(VERSION, 2),
      nonce,
      cipher.encrypt(plaintext),
    );
  } finally {
    key.fill(0);
  }
}

export function decryptCredential(
  exportKey: Uint8Array,
  binding: CredentialBinding,
  envelope: Uint8Array,
): Uint8Array {
  if (envelope.byteLength < 10 || !hasMagic(envelope)) {
    throw new Error("Unknown credential envelope");
  }
  const version = (envelope[8] << 8) | envelope[9];
  if (version !== VERSION) {
    throw new Error(`Unsupported credential envelope version: ${version}`);
  }
  if (envelope.byteLength < HEADER_LEN + TAG_LEN) {
    throw new Error("Unknown credential envelope");
  }
  const nonce = envelope.slice(10, HEADER_LEN);
  const sealed = envelope.slice(HEADER_LEN);
  const key = credentialKey(exportKey);
  try {
    return xchacha20poly1305(key, nonce, associatedData(binding)).decrypt(
      sealed,
    );
  } catch {
    throw new Error("Credential envelope authentication failed");
  } finally {
    key.fill(0);
  }
}

function hasMagic(envelope: Uint8Array): boolean {
  return MAGIC.every((byte, index) => envelope[index] === byte);
}
