import { MTPClient, base64ToBytes } from "mtp";
import type { StorageContextValue } from "@tensamin/storage/context";
import { canonicalPublicKeyBundle, serializeTuCredential } from "../credential";
import { fetchAccountIdentity, normalizeOmegaOrigin } from "../omega";
import { provisioningRegistry } from "../transport";
import { mtp } from "@tensamin/shared/data";
import {
  buildCredentialPayload,
  sendProvisioningCredential,
} from "./credential";

export async function claimTemporaryLogin({
  id,
  client,
  storage,
}: {
  id: string;
  client: MTPClient;
  storage: Pick<StorageContextValue, "load">;
}) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error("Invalid temporary login ID");
  const authenticated = client as unknown as MTPClient<typeof mtp>;
  const protocol = client as unknown as MTPClient<typeof provisioningRegistry>;
  const userId = await storage.load("user_id");
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => {});
  const unsubscribeReady = protocol.subscribe(
    "QrProvisioningConfirm",
    (message) => {
      if (message.data.Uuid === id) resolveReady();
    },
  );
  const unsubscribeCancel = protocol.subscribe(
    "ProvisioningCancel",
    (message) => {
      if ((message.data as { Uuid?: string }).Uuid === id)
        rejectReady(new Error("Login cancelled by the other device"));
    },
  );
  const timeout = setTimeout(
    () => rejectReady(new Error("Login session expired")),
    120_000,
  );
  const cleanup = () => {
    unsubscribeReady();
    unsubscribeCancel();
    clearTimeout(timeout);
  };
  void ready.then(cleanup, cleanup);
  const peer = await authenticated
    .request("ProvisioningBindAccount", {
      Uuid: id,
      UserId: userId,
    })
    .catch((error: unknown) => {
      cleanup();
      throw error;
    });
  // The claim reply carries the registered pending client's key, not account data.
  const data = peer.data as unknown as {
    Uuid: string;
    PublicKey: string;
    ProvisioningParticipantId: number;
  };
  if (data.Uuid !== id) throw new Error("Login session mismatch");
  const publicKey = canonicalPublicKeyBundle(data.PublicKey);
  let cancelled = false;
  return {
    cancel: () => {
      cancelled = true;
      rejectReady(new Error("Login cancelled"));
      return protocol.request("ProvisioningCancel", { Uuid: id });
    },
    confirm: async () => {
      if (cancelled) throw new Error("Login cancelled");
      await ready;
      await protocol.request("QrProvisioningConfirm", { Uuid: id });
      const omega = normalizeOmegaOrigin(await storage.load("omega_url"));
      const own = await authenticated.request("GetUserData", {
        UserId: userId,
      });
      const account = await fetchAccountIdentity(
        omega,
        String(own.data.Username),
      );
      if (account.user_id !== userId) throw new Error("Account mismatch");
      const encoded = await storage.load("mtp_keyring");
      if (cancelled) throw new Error("Login cancelled");
      const keyring = base64ToBytes(encoded);
      try {
        await sendProvisioningCredential({
          client: protocol,
          payload: buildCredentialPayload({
            sessionUuid: id,
            method: "qr-contact-created",
            account,
            credential: new TextEncoder().encode(
              serializeTuCredential({
                userId,
                privateKey: encoded,
                domain: new URL(omega).hostname,
              }),
            ),
          }),
          signerKeyring: keyring,
          contactParticipantId: data.ProvisioningParticipantId,
          contactPublicKeyBundle: publicKey,
        });
      } finally {
        keyring.fill(0);
      }
    },
  };
}
