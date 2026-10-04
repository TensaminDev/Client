import type { ParsedFrame } from "mtp";
import { DUAL_SIGNATURE_SUITE, PROTECTION_PURPOSE } from "../protection";
import {
  canonicalPublicKeyBundle,
  fingerprintOf,
  omegaHostOf,
  requireProvisioningCredentialFields,
  serializeTuCredential,
  validateRecoveredCredential,
  type RecoveredCredential,
} from "../credential";
import type { ProvisioningClient } from "../transport";
import type { ProvisioningLifecycle } from "../events";
import {
  fetchAccountIdentity,
  verifyAccountBinding,
  type OmegaAccount,
} from "../omega";

export type ProvisioningCredentialPayload = {
  Uuid: string;
  ProvisioningMethod: string;
  UserId: number;
  IotaId: number;
  EncryptedCredential: Uint8Array;
  Sha256: Uint8Array;
};

export function buildCredentialPayload({
  sessionUuid,
  method,
  account,
  credential,
}: {
  sessionUuid: string;
  method: string;
  account: OmegaAccount;
  credential: Uint8Array;
}): ProvisioningCredentialPayload {
  return {
    Uuid: sessionUuid,
    ProvisioningMethod: method,
    UserId: account.user_id,
    IotaId: account.iota_id,
    EncryptedCredential: credential,
    Sha256: fingerprintOf(canonicalPublicKeyBundle(account.public_key)),
  };
}

/**
 * Owner side: send the permanent credential as a protected MTP frame signed
 * by the permanent account key and encrypted to the Contact temporary key.
 * The provisioning transport's temporary keyring must never become the
 * signer by default.
 */
export async function sendProvisioningCredential({
  client,
  payload,
  signerKeyring,
  contactParticipantId,
  contactPublicKeyBundle,
}: {
  client: ProvisioningClient;
  payload: ProvisioningCredentialPayload;
  signerKeyring: Uint8Array;
  contactParticipantId: number;
  contactPublicKeyBundle: Uint8Array;
}): Promise<void> {
  await client
    .sendProtected("ProvisioningCredential", payload, {
      id: globalThis.crypto.getRandomValues(new Uint32Array(1))[0] || 1,
      receiverId: BigInt(contactParticipantId),
      identity: { signerId: BigInt(payload.UserId), keyring: signerKeyring },
      recipients: [contactPublicKeyBundle],
      signaturePurpose: PROTECTION_PURPOSE.provisioningCredentialSignature,
      encryptionPurpose: PROTECTION_PURPOSE.provisioningCredentialEncryption,
      signatureSuite: DUAL_SIGNATURE_SUITE,
      exposeSender: false,
    })
    .finally(() => payload.EncryptedCredential.fill(0));
}

/**
 * Contact side: open a raw protected credential frame after independently
 * resolving the account through Omega, then run the full validation gate.
 */
export async function openProvisioningCredential({
  client,
  frame,
  contactParticipantId,
  contactKeyring,
  expected,
}: {
  client: ProvisioningClient;
  frame: ParsedFrame;
  contactParticipantId: number;
  contactKeyring: Uint8Array;
  expected: {
    uuid: string;
    method: string;
    account: OmegaAccount;
    omegaHost: string;
  };
}): Promise<RecoveredCredential> {
  const message = await client.openProtected(frame, {
    recipient: contactKeyring.length
      ? {
          id: BigInt(contactParticipantId),
          keyring: contactKeyring,
        }
      : undefined,
    expectedSignerId: BigInt(expected.account.user_id),
    expectedReceiverId: BigInt(contactParticipantId),
    resolveSignerPublicKeys: () => [
      canonicalPublicKeyBundle(expected.account.public_key),
    ],
    signaturePurpose: PROTECTION_PURPOSE.provisioningCredentialSignature,
    encryptionPurpose: PROTECTION_PURPOSE.provisioningCredentialEncryption,
    signaturePolicy: DUAL_SIGNATURE_SUITE,
  });
  const { encryptedCredential: credential, fingerprint } =
    requireProvisioningCredentialFields(message.data, {
      uuid: expected.uuid,
      method: expected.method,
      userId: expected.account.user_id,
      iotaId: expected.account.iota_id,
    });
  return validateRecoveredCredential({
    content: credential,
    expectedUserId: expected.account.user_id,
    omegaHost: expected.omegaHost,
    expectedPublicKey: expected.account.public_key,
    fingerprint,
  });
}

/**
 * Owner side: resolve the own account through Omega, verify the local
 * permanent keyring still matches, bind the account to the session, and
 * require the returned binding to match Omega.
 */
export async function bindOwnerAccount({
  client,
  sessionUuid,
  omega,
  username,
  keyringBase64,
  lifecycle,
}: {
  client: ProvisioningClient;
  sessionUuid: string;
  omega: string;
  username: string;
  keyringBase64: string;
  lifecycle: ProvisioningLifecycle;
}): Promise<{ account: OmegaAccount; keyring: Uint8Array }> {
  const omegaHost = omegaHostOf(omega);
  const account = await fetchAccountIdentity(omega, username);
  lifecycle.assertActive("ProvisioningBindAccount identity lookup");
  const recovered = validateRecoveredCredential({
    content: serializeTuCredential({
      userId: account.user_id,
      privateKey: keyringBase64,
      domain: omegaHost,
    }),
    expectedUserId: account.user_id,
    omegaHost,
    expectedPublicKey: account.public_key,
  });
  try {
    lifecycle.assertActive("ProvisioningBindAccount");
    const binding = await client.request("ProvisioningBindAccount", {
      Uuid: sessionUuid,
      UserId: account.user_id,
    });
    lifecycle.assertActive("ProvisioningBindAccount response");
    await verifyAccountBinding({
      omega,
      binding: binding.data,
      expectedUuid: sessionUuid,
    });
    lifecycle.assertActive("ProvisioningBindAccount verification");
    return { account, keyring: recovered.keyring };
  } catch (error) {
    recovered.keyring.fill(0);
    throw error;
  }
}
