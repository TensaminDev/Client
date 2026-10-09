import type { StorageContextValue } from "@tensamin/storage/context";
import { ProvisioningLifecycle } from "../events";
import { PeerVerificationError } from "../errors";
import {
  fetchLiveOmikron,
  normalizeOmegaOrigin,
  omikronEndpointUrl,
} from "../omega";
import {
  connectProvisioningClient,
  releaseProvisioningConnection,
  trackProvisioningLifecycle,
} from "../transport";
import { ContactCredentialReceiver } from "./receiving";

export async function createContactCreatedSession({
  omegaOrigin,
  signal,
}: {
  omegaOrigin: string;
  signal?: AbortSignal;
}) {
  const omega = normalizeOmegaOrigin(omegaOrigin);
  const temporaryLoginId = globalThis.crypto.randomUUID();
  const omikron = await fetchLiveOmikron(omega, signal);
  const connection = await connectProvisioningClient({
    omikron: {
      id: omikron.id,
      url: omikronEndpointUrl(omikron),
      publicKey: omikron.public_key,
    },
    signal,
  });
  const lifecycle = new ProvisioningLifecycle();
  trackProvisioningLifecycle(
    connection,
    lifecycle,
    () => temporaryLoginId,
    signal,
  );
  let receiver: ContactCredentialReceiver | undefined;
  try {
    const requestedAt = Date.now();
    const created = await connection.client.request("ProvisioningCreate", {
      Uuid: temporaryLoginId,
      ProvisioningMethod: "qr-contact-created",
      ProvisioningRole: "contact",
      PublicKey: connection.publicKeyBase64,
    });
    if (
      created.data.Uuid !== temporaryLoginId ||
      created.data.ProvisioningMethod !== "qr-contact-created" ||
      created.data.ProvisioningRole !== "contact"
    )
      throw new PeerVerificationError("Login session registration mismatch");
    lifecycle.markActive();
    receiver = new ContactCredentialReceiver({
      bindingTimeoutMs: Math.max(
        1,
        requestedAt + (created.data.Timestamp ?? 120) * 1_000 - Date.now(),
      ),
      client: connection.client,
      lifecycle,
      sessionUuid: temporaryLoginId,
      contactParticipantId: created.data.ProvisioningParticipantId,
      contactKeyring: connection.keyring,
    });
    receiver.install();
    const activeReceiver = receiver;
    return {
      expiresAt: requestedAt + (created.data.Timestamp ?? 120) * 1_000,
      temporaryLoginId,
      omega,
      awaitVerifiedBinding: () => activeReceiver.awaitVerifiedBinding(omega),
      avatarReady: () =>
        connection.client.request("QrProvisioningConfirm", {
          Uuid: temporaryLoginId,
        }),
      persistAndComplete: async ({
        storage,
      }: {
        storage: Pick<StorageContextValue, "load" | "save">;
      }) => {
        const account = await activeReceiver.awaitVerifiedBinding(omega);
        const recovered = await activeReceiver.awaitRecoveredCredential({
          omega,
          account,
          method: "qr-contact-created",
        });
        await activeReceiver.persistAndComplete({ storage, recovered, omega });
      },
      dispose: () => {
        activeReceiver.dispose();
        releaseProvisioningConnection(connection, lifecycle);
      },
    };
  } catch (error) {
    receiver?.dispose();
    lifecycle.fail("create-failed", error);
    releaseProvisioningConnection(connection, lifecycle);
    throw error;
  }
}
