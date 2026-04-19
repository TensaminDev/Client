import * as Comlink from "comlink";

type Base64URLString = string;

type JWK = {
  kty: string;
  crv: string;
  x?: string;
  d?: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const crypto = globalThis.crypto;

/**
 * Encodes bytes as standard base64 text.
 * @param bytes Bytes to encode.
 * @returns Base64 string.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Decodes standard base64 text into bytes.
 * @param base64 Base64 string.
 * @returns Decoded bytes.
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Encrypts bytes with a symmetric key derived from a hex shared secret.
 * @param secret Hex-encoded shared secret.
 * @param input Plaintext bytes to encrypt.
 * @returns Ciphertext bytes.
 */
export async function encrypt(
  secret: string,
  input: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const sharedSecret = new Uint8Array(
    secret.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const okm = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array([]),
      info: textEncoder.encode("x448-aes-gcm-no-overhead"),
    },
    hkdfKey,
    44 * 8,
  );

  const okmBytes = new Uint8Array(okm);
  const keyBytes = okmBytes.slice(0, 32);
  const nonce = okmBytes.slice(32, 44);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    input,
  );

  return new Uint8Array(encryptedBuffer);
}

/**
 * Decrypts bytes with a symmetric key derived from a hex shared secret.
 * @param secret Hex-encoded shared secret.
 * @param input Ciphertext bytes to decrypt.
 * @returns Plaintext bytes.
 */
export async function decrypt(
  secret: string,
  input: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const sharedSecret = new Uint8Array(
    secret.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const okm = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array([]),
      info: textEncoder.encode("x448-aes-gcm-no-overhead"),
    },
    hkdfKey,
    44 * 8,
  );

  const okmBytes = new Uint8Array(okm);
  const keyBytes = okmBytes.slice(0, 32);
  const nonce = okmBytes.slice(32, 44);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    aesKey,
    input,
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Encrypts UTF-8 text and returns base64 ciphertext for easy transport/storage.
 * @param secret Hex-encoded shared secret.
 * @param plaintext Text to encrypt.
 * @returns Base64 ciphertext.
 */
export async function encryptText(
  secret: string,
  plaintext: string,
): Promise<string> {
  const encrypted = await encrypt(secret, textEncoder.encode(plaintext));
  return bytesToBase64(encrypted);
}

/**
 * Decrypts base64 ciphertext into UTF-8 text.
 * @param secret Hex-encoded shared secret.
 * @param ciphertext Base64 ciphertext.
 * @returns Decrypted text.
 */
export async function decryptText(
  secret: string,
  ciphertext: string,
): Promise<string> {
  const decrypted = await decrypt(secret, base64ToBytes(ciphertext));
  return textDecoder.decode(decrypted);
}

/**
 * Computes an X448 shared secret from local and peer key material.
 * @param ownPrivateKey Local private key in raw/base64/base64url or PKCS#8-wrapped form.
 * @param ownPublicKey Local public key in raw/base64/base64url or SPKI-wrapped form.
 * @param otherPublicKey Peer public key in raw/base64/base64url or SPKI-wrapped form.
 * @returns Hex-encoded shared secret, or a failure message when key material is missing/invalid.
 */
export async function getSharedSecret(
  ownPrivateKey: string,
  ownPublicKey: string,
  otherPublicKey: string,
): Promise<string> {
  const otherJwk: JWK = { kty: "OKP", crv: "X448", x: otherPublicKey };
  const ownJwk: JWK = {
    kty: "OKP",
    crv: "X448",
    x: ownPublicKey,
    d: ownPrivateKey,
  };

  /**
   * Converts bytes to a lowercase hex string.
   * @param u8 Byte array.
   * @returns Hex string.
   */
  const bytesToHex = (u8: Uint8Array): string =>
    Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");

  /**
   * Decodes standard base64 text into bytes.
   * @param s Base64 string.
   * @returns Decoded bytes.
   */
  const b64ToBytes = (s: Base64URLString): Uint8Array => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  /**
   * Decodes URL-safe base64 text into bytes.
   * @param s Base64url string.
   * @returns Decoded bytes.
   */
  const b64uToBytes = (s: Base64URLString): Uint8Array => {
    const b64 =
      s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    return b64ToBytes(b64);
  };

  /**
   * Encodes bytes as URL-safe base64 without padding.
   * @param u8 Byte array.
   * @returns Base64url string.
   */
  const bytesToB64u = (u8: Uint8Array): string => {
    const b64 = btoa(String.fromCharCode(...u8));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  /**
   * Decodes either base64 or base64url text into bytes.
   * @param s Base64/base64url string.
   * @returns Decoded bytes.
   */
  const decodeBase64Auto = (s: string): Uint8Array =>
    /[-_]/.test(s) ? b64uToBytes(s) : b64ToBytes(s);

  /**
   * Reads a DER TLV item from the provided offset.
   * @param view DER-encoded bytes.
   * @param off Start offset.
   * @returns Parsed TLV metadata with tag, length, and boundaries.
   */
  const readTLV = (view: Uint8Array, off: number) => {
    const tag = view[off++];
    if (off >= view.length) throw new Error("DER: truncated");
    let len = view[off++];
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0) throw new Error("DER: indefinite length not supported");
      if (off + n > view.length) throw new Error("DER: truncated length");
      len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | view[off++];
    }
    const start = off;
    const end = off + len;
    if (end > view.length) throw new Error("DER: content truncated");
    return { tag, len, start, end };
  };

  /**
   * Validates that a DER OID matches X448.
   * @param view DER-encoded bytes.
   * @param start Offset of the OID TLV.
   * @returns True when the OID is X448.
   */
  const ensureOidX448 = (view: Uint8Array, start: number): boolean => {
    const oid = readTLV(view, start);
    if (oid.tag !== 0x06) return false;
    const len = oid.end - oid.start;
    if (len !== 3) return false;
    return (
      view[oid.start] === 0x2b &&
      view[oid.start + 1] === 0x65 &&
      view[oid.start + 2] === 0x6f
    );
  };

  /**
   * Extracts raw 56-byte X448 public key material from SPKI bytes.
   * @param spkiBytes DER-encoded SPKI bytes.
   * @returns Raw X448 public key bytes.
   */
  const extractRawX448FromSPKI = (spkiBytes: Uint8Array): Uint8Array => {
    const view = spkiBytes;
    const outer = readTLV(view, 0);
    if (outer.tag !== 0x30) throw new Error("SPKI: expected SEQUENCE");
    const alg = readTLV(view, outer.start);
    if (alg.tag !== 0x30) throw new Error("SPKI: expected AlgorithmIdentifier");
    if (!ensureOidX448(view, alg.start)) throw new Error("SPKI: not X448");
    const bitstr = readTLV(view, alg.end);
    if (bitstr.tag !== 0x03) throw new Error("SPKI: expected BIT STRING");
    const unusedBits = view[bitstr.start];
    if (unusedBits !== 0x00) throw new Error("SPKI: unexpected unused bits");
    const raw = view.subarray(bitstr.start + 1, bitstr.end);
    if (raw.length !== 56)
      throw new Error("SPKI: X448 public key must be 56 bytes");
    return raw;
  };

  /**
   * Extracts raw 56-byte X448 private key material from PKCS#8 bytes.
   * @param pkcs8Bytes DER-encoded PKCS#8 bytes.
   * @returns Raw X448 private key bytes.
   */
  const extractRawX448FromPKCS8 = (pkcs8Bytes: Uint8Array): Uint8Array => {
    const view = pkcs8Bytes;
    const outer = readTLV(view, 0);
    if (outer.tag !== 0x30) throw new Error("PKCS8: expected SEQUENCE");
    let off = outer.start;

    const version = readTLV(view, off);
    if (version.tag !== 0x02)
      throw new Error("PKCS8: expected version INTEGER");
    off = version.end;

    const alg = readTLV(view, off);
    if (alg.tag !== 0x30)
      throw new Error("PKCS8: expected AlgorithmIdentifier");
    if (!ensureOidX448(view, alg.start)) throw new Error("PKCS8: not X448");
    off = alg.end;

    const priv = readTLV(view, off);
    if (priv.tag !== 0x04)
      throw new Error("PKCS8: expected privateKey OCTET STRING");
    let raw = view.subarray(priv.start, priv.end);

    // Some encoders nest another OCTET STRING inside
    if (raw[0] === 0x04) {
      const inner = readTLV(raw, 0);
      if (inner.tag === 0x04) {
        raw = raw.subarray(inner.start, inner.end);
      }
    }
    if (raw.length !== 56)
      throw new Error("PKCS8: X448 private key must be 56 bytes");
    return raw;
  };

  /**
   * Normalizes X448 JWK fields into raw base64url key material.
   * @param jwk Candidate JWK.
   * @param label Error label for diagnostics.
   * @returns Normalized JWK suitable for WebCrypto import.
   */
  const normalizeOkpX448Jwk = (jwk: JWK, label: string): JWK => {
    if (!jwk || jwk.kty !== "OKP" || jwk.crv !== "X448") {
      throw new Error(`${label}: expected OKP JWK with crv "X448"`);
    }
    const out = { ...jwk };

    if (out.x) {
      const xBytes = decodeBase64Auto(out.x);
      let rawX: Uint8Array;
      try {
        rawX = extractRawX448FromSPKI(xBytes);
      } catch {
        if (xBytes.length !== 56) {
          throw new Error(
            `${label}: "x" is not a valid X448 SPKI or raw 56-byte key`,
          );
        }
        rawX = xBytes;
      }
      out.x = bytesToB64u(rawX);
    }

    if (out.d) {
      const dBytes = decodeBase64Auto(out.d);
      let rawD: Uint8Array;
      try {
        rawD = extractRawX448FromPKCS8(dBytes);
      } catch {
        if (dBytes.length !== 56) {
          throw new Error(
            `${label}: "d" is not a valid X448 PKCS#8 or raw 56-byte key`,
          );
        }
        rawD = dBytes;
      }
      out.d = bytesToB64u(rawD);
    }

    return out;
  };

  /**
   * Returns WebCrypto subtle API when available.
   * @returns SubtleCrypto instance or undefined.
   */
  const getSubtle = () => globalThis.crypto?.subtle;

  {
    /*
    const hkdfAesGcmFromShared = async (
      sharedSecret: BufferSource,
      infoStr: string
    ): Promise<CryptoKey> => {
      const subtle = getSubtle();
      if (!subtle) throw new Error("WebCrypto subtle not available");
      const info = textEncoder.encode(infoStr);
      const baseKey = await subtle.importKey(
        "raw",
        sharedSecret,
        "HKDF",
        false,
        ["deriveKey"]
      );
      return await subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(0),
          info,
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    };
    */
  }

  const myJwk: JWK = normalizeOkpX448Jwk(ownJwk, "own_jwk");
  const peerJwk: JWK = normalizeOkpX448Jwk(otherJwk, "other_jwk");

  const subtle = getSubtle();
  //const infoStr = `ECDH-X448-AES-GCM-v1|my=${myJwk.x}|peer=${peerJwk.x}`;

  if (subtle) {
    const algorithms = [{ name: "ECDH", namedCurve: "X448" }, { name: "X448" }];

    for (const algorithm of algorithms) {
      try {
        const [myPriv, peerPub] = await Promise.all([
          subtle.importKey("jwk", myJwk, algorithm, false, ["deriveBits"]),
          subtle.importKey("jwk", peerJwk, algorithm, false, []),
        ]);

        const sharedBits = await subtle.deriveBits(
          { name: algorithm.name, public: peerPub },
          myPriv,
          448,
        );

        const sharedSecret = new Uint8Array(sharedBits);
        //const aeadKey = await hkdfAesGcmFromShared(sharedSecret, infoStr);

        return bytesToHex(sharedSecret);
      } catch {
        // Browser doesn't support this algorithm, try next or fall through to software fallback
      }
    }
  }

  const { d: dMyB64u } = myJwk;
  //const { x: xMyB64u, d: dMyB64u } = myJwk;
  const { x: xPeerB64u } = peerJwk;

  if (!dMyB64u || !xPeerB64u) {
    return "Failed to get shared secret due to missing keys";
  }

  const [dRaw, xRawPeer] = [b64uToBytes(dMyB64u), b64uToBytes(xPeerB64u)];
  if (dRaw.length !== 56 || xRawPeer.length !== 56) {
    return "Failed to get shared secret due to invalid key lengths";
  }

  const { x448 } = await import("@noble/curves/ed448.js");
  const sharedSecret = new Uint8Array(x448.getSharedSecret(dRaw, xRawPeer));
  //const aeadKey = await hkdfAesGcmFromShared(sharedSecret, infoStr);

  return bytesToHex(sharedSecret);
}

/**
 * @deprecated Use getSharedSecret instead.
 * @param ownPrivateKey Local private key.
 * @param ownPublicKey Local public key.
 * @param otherPublicKey Peer public key.
 * @returns Shared secret derived by getSharedSecret.
 */
export async function get_shared_secret(
  ownPrivateKey: string,
  ownPublicKey: string,
  otherPublicKey: string,
): Promise<string> {
  return await getSharedSecret(ownPrivateKey, ownPublicKey, otherPublicKey);
}

/**
 * Checks whether the current runtime context is a worker global scope.
 * @returns True when executed inside a worker-like runtime.
 */
function isWorkerRuntime(): boolean {
  return "postMessage" in globalThis && "importScripts" in globalThis;
}

if (isWorkerRuntime()) {
  Comlink.expose({
    encrypt,
    decrypt,
    encryptText,
    decryptText,
    getSharedSecret,
  });
}
