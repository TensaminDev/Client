import {
  getGroup,
  CurveId,
  type ClientAkeState,
  type KE2,
} from "@structured-id/opaque";
import { extract, expand } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { equalBytes } from "@noble/ciphers/utils.js";
import { concatBytes, utf8Bytes, writeUintBE } from "../bytes";

function expandLabel(secret: Uint8Array, label: string, context: Uint8Array) {
  const fullLabel = utf8Bytes(`OPAQUE-${label}`);
  return expand(
    sha512,
    secret,
    concatBytes(
      writeUintBE(64, 2),
      Uint8Array.of(fullLabel.length),
      fullLabel,
      Uint8Array.of(context.length),
      context,
    ),
    64,
  );
}

/** opaque-ke's TripleDH ordering differs from opaque 1.0.5's AKE helper. */
export function finishAke(
  secret: Uint8Array,
  serverKey: Uint8Array,
  ke2: KE2,
  state: ClientAkeState,
  clientId: Uint8Array,
  serverId: Uint8Array,
  context: Uint8Array,
): Uint8Array {
  const group = getGroup(CurveId.RISTRETTO255);
  const dh = [
    group.ecdh(state.clientSecretKeyshare, ke2.serverPublicKeyshare),
    group.ecdh(state.clientSecretKeyshare, serverKey),
    group.ecdh(secret, ke2.serverPublicKeyshare),
  ];
  const preamble = concatBytes(
    utf8Bytes("OPAQUEv1-"),
    writeUintBE(context.length, 2),
    context,
    writeUintBE(clientId.length, 2),
    clientId,
    state.ke1Serialized,
    writeUintBE(serverId.length, 2),
    serverId,
    ke2.credentialResponse,
    ke2.serverNonce,
    ke2.serverPublicKeyshare,
  );
  const ikm = concatBytes(...dh);
  const prk = extract(sha512, ikm);
  const handshake = expandLabel(prk, "HandshakeSecret", sha512(preamble));
  const km2 = expandLabel(handshake, "ServerMAC", new Uint8Array());
  const km3 = expandLabel(handshake, "ClientMAC", new Uint8Array());
  try {
    const expected = hmac(sha512, km2, sha512(preamble));
    if (!equalBytes(expected, ke2.serverMac))
      throw new Error("Invalid server MAC");
    return hmac(sha512, km3, sha512(concatBytes(preamble, expected)));
  } finally {
    for (const bytes of [...dh, ikm, prk, handshake, km2, km3]) bytes.fill(0);
  }
}
