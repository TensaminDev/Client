import { MTPClient, MTPProtocolError, base64ToBytes, bytesToBase64 } from "mtp";
import * as mtpRaw from "mtp/raw";
import { useStorage } from "@tensamin/storage/context";
import { persistMtpCredentials } from "@tensamin/storage/credentials";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";

type InvitationTarget = {
  credential: string;
  invitationId: number;
  iotaId: number;
};

type PendingInvitationRegistration = {
  target: InvitationTarget;
  username: string;
  invitationPassword: string;
  keyring: string;
  resetToken: string;
  userId?: number;
};

function registrationStatusDecision(
  data: Record<string, unknown>,
):
  | { kind: "wait" }
  | { kind: "activate"; challenge: bigint }
  | { kind: "revoked" }
  | { kind: "expired" } {
  switch (data.InvitationState) {
    case "provisioning":
      return { kind: "wait" };
    case "redeemed":
      if (data.ServerNonce === undefined) {
        throw new Error("Redeemed invitation has no activation challenge.");
      }
      return {
        kind: "activate",
        challenge: BigInt(data.ServerNonce as bigint | number | string),
      };
    case "revoked":
      return { kind: "revoked" };
    case "expired":
      return { kind: "expired" };
    default:
      throw new Error(
        "The registration service returned an unexpected invitation state.",
      );
  }
}

function isActivationRouteUnavailable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorType" in error &&
    error.errorType === "activation_route_unavailable"
  );
}

async function initializeRegistration<T>({
  initialize,
  load,
  restore,
  generateKeyring,
}: {
  initialize: () => Promise<unknown>;
  load: () => Promise<string>;
  restore: (stored: string) => T | null;
  generateKeyring: () => Uint8Array;
}): Promise<
  { kind: "restored"; value: T } | { kind: "new"; keyring: Uint8Array }
> {
  const [, stored] = await Promise.all([initialize(), load()]);
  if (stored) {
    const restored = restore(stored);
    if (restored !== null) {
      return { kind: "restored", value: restored };
    }
  }
  return { kind: "new", keyring: generateKeyring() };
}

function parseRawToken(value: string): InvitationTarget | null {
  const parts = value.trim().split("::");
  if (parts.length !== 5 || parts[0] !== "tinv1" || parts[1] !== "o") {
    return null;
  }
  const iotaId = Number(parts[2]);
  const invitationId = Number(parts[3]);
  if (
    !Number.isSafeInteger(iotaId) ||
    iotaId <= 0 ||
    !Number.isSafeInteger(invitationId) ||
    invitationId <= 0 ||
    !parts[4]
  ) {
    return null;
  }
  return { credential: value.trim(), invitationId, iotaId };
}

function targetFromFragment(): InvitationTarget | null {
  const fragment = window.location.hash.slice(1);
  const params = new URLSearchParams(
    fragment.includes("?")
      ? fragment.slice(fragment.indexOf("?") + 1)
      : fragment,
  );
  const credential = params.get("invitation");
  const invitationId = Number(params.get("invitation_id"));
  const iotaId = Number(params.get("iota_id"));
  if (
    !credential ||
    !Number.isSafeInteger(invitationId) ||
    invitationId <= 0 ||
    !Number.isSafeInteger(iotaId) ||
    iotaId <= 0
  ) {
    return null;
  }
  return { credential, invitationId, iotaId };
}

function activationPayload(
  target: InvitationTarget,
  userId: number,
  nonce: bigint,
) {
  const prefix = new TextEncoder().encode("tensamin:invitation-activate:v1\0");
  const output = new Uint8Array(prefix.length + 32);
  output.set(prefix);
  const view = new DataView(output.buffer);
  view.setBigInt64(prefix.length, BigInt(userId));
  view.setBigInt64(prefix.length + 8, BigInt(target.iotaId));
  view.setBigInt64(prefix.length + 16, BigInt(target.invitationId));
  view.setBigUint64(prefix.length + 24, nonce);
  return output;
}

function publicKeyBundle(keyring: Uint8Array) {
  const parsed = mtpRaw.WasmKeyring.from_bytes(keyring);
  try {
    const bundle = parsed.public_key_bundle();
    try {
      return bundle.try_to_bytes();
    } finally {
      bundle.free();
    }
  } finally {
    parsed.free();
  }
}

function responseData(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The registration service returned malformed data.");
  }
  return data as Record<string, unknown>;
}

function saveKeyringFile(keyring: Uint8Array) {
  const blob = new Blob([bytesToBase64(keyring)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tensamin-keyring.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useRegistration() {
  const { load, save } = useStorage();
  const navigate = useNavigate();
  const [initialTarget] = useState(targetFromFragment);
  const keyring = useRef<Uint8Array | null>(null);
  const resetToken = useRef<string | null>(null);
  const pendingRegistration = useRef<PendingInvitationRegistration | null>(
    null,
  );
  const [credential, setCredential] = useState(initialTarget?.credential ?? "");
  const [username, setUsername] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void initializeRegistration({
      initialize: () => MTPClient.init(),
      load: () => load("pending_invitation_registration"),
      restore: (savedPending) => {
        try {
          const parsed = JSON.parse(
            savedPending,
          ) as PendingInvitationRegistration;
          const target =
            parseRawToken(parsed.target.credential) ?? parsed.target;
          if (target.invitationId > 0 && target.iotaId > 0) {
            return {
              pending: { ...parsed, target },
              keyring: base64ToBytes(parsed.keyring),
              resetToken: parsed.resetToken,
            };
          }
        } catch {
          // Invalid persisted state is replaced only after loading has completed.
        }
        return null;
      },
      generateKeyring: () => MTPClient.crypto.generateKeyring(),
    })
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "restored") {
          pendingRegistration.current = result.value.pending;
          keyring.current = result.value.keyring;
          resetToken.current = result.value.resetToken;
          setCredential(result.value.pending.target.credential);
          setUsername(result.value.pending.username);
        } else {
          pendingRegistration.current = null;
          keyring.current = result.keyring;
        }
        setInitialized(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Registration initialization failed.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initialized || busy) return;
    setBusy(true);
    let client: MTPClient | null = null;
    try {
      const form = new FormData(event.currentTarget);
      const requestedUsername = String(form.get("username") ?? "")
        .trim()
        .toLowerCase();
      const password = String(form.get("password") ?? "");
      const pending = pendingRegistration.current;
      const username = pending?.userId ? pending.username : requestedUsername;
      const target =
        pending?.target ?? initialTarget ?? parseRawToken(credential);
      if (!target)
        throw new Error(
          "Use a complete invitation link or a valid raw invitation token.",
        );
      if (!/^[a-z0-9]{1,15}$/.test(username)) {
        throw new Error("Usernames use 1 to 15 lowercase letters or numbers.");
      }
      const omegaUrl = await load("omega_url");
      const omegaBaseUrl = omegaUrl.endsWith("/") ? omegaUrl : `${omegaUrl}/`;
      if (!pending?.userId) {
        const availability = await fetch(
          `${omegaBaseUrl}api/get/id/${encodeURIComponent(username)}`,
        );
        if (availability.ok) throw new Error("That username is already taken.");
        if (availability.status !== 404)
          throw new Error("Username availability could not be checked.");
      }

      await MTPClient.init();
      keyring.current ??= MTPClient.crypto.generateKeyring();
      const privateKeyring = keyring.current;
      resetToken.current ??= bytesToBase64(
        crypto.getRandomValues(new Uint8Array(192)),
      );
      const accountResetToken = resetToken.current;
      const registration: PendingInvitationRegistration = pending?.userId
        ? pending
        : {
            target,
            username,
            invitationPassword: password,
            keyring: bytesToBase64(privateKeyring),
            resetToken: accountResetToken,
          };
      pendingRegistration.current = registration;
      await save(
        "pending_invitation_registration",
        JSON.stringify(registration),
        {
          secure: true,
        },
      );
      await save("mtp_keyring", bytesToBase64(privateKeyring), {
        secure: true,
      });
      let userId = registration.userId;
      for (;;) {
        client?.disconnect();
        setMessage("Connecting to the Iota registration service…");
        const discovery = await fetch(
          `${omegaBaseUrl}api/get/registration-omikron/${target.iotaId}`,
        );
        if (!discovery.ok)
          throw new Error("No Omikron is available for registration.");
        const omikron = (await discovery.json()) as {
          ip_address?: string;
          port?: number;
          public_key?: string;
        };
        if (!omikron.ip_address || !omikron.port || !omikron.public_key) {
          throw new Error("Omega returned invalid Omikron connection data.");
        }
        client = await MTPClient.create({
          url: `https://${omikron.ip_address}:${omikron.port}`,
          descriptor: "registering-client",
          credentials: { clientId: null, keyring: privateKeyring },
          hostPublicKey: { value: omikron.public_key, encoding: "base64" },
          throwProtocolErrors: true,
        });
        await client.connectUnauthenticated();
        setMessage(
          userId ? "Resuming account creation…" : "Creating your account…",
        );
        const response = await client.request("RedeemUserInvitation", {
          InvitationAuthority: "omega",
          InvitationId: target.invitationId,
          IotaId: target.iotaId,
          InvitationToken: target.credential,
          Username: username,
          PublicKey: bytesToBase64(publicKeyBundle(privateKeyring)),
          ResetToken: accountResetToken,
          ...(registration.invitationPassword
            ? { InvitationPassword: registration.invitationPassword }
            : {}),
        });
        userId = Number(responseData(response.data).UserId);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw new Error("Omega did not return the new account ID.");
        }
        registration.userId = userId;
        await save(
          "pending_invitation_registration",
          JSON.stringify(registration),
          { secure: true },
        );

        setMessage("Waiting for the Iota to provision your account…");
        let challenge: bigint | null = null;
        for (;;) {
          const status = await client.request("GetUserInvitationStatus", {
            InvitationId: target.invitationId,
            IotaId: target.iotaId,
          });
          const data = responseData(status.data);
          const decision = registrationStatusDecision(data);
          switch (decision.kind) {
            case "wait":
              await new Promise((resolve) => window.setTimeout(resolve, 1000));
              continue;
            case "activate":
              challenge = decision.challenge;
              break;
            case "revoked":
              await save("pending_invitation_registration", "", {
                secure: true,
              });
              pendingRegistration.current = null;
              throw new Error("This invitation was revoked.");
            case "expired":
              await save("pending_invitation_registration", "", {
                secure: true,
              });
              pendingRegistration.current = null;
              throw new Error("This invitation expired.");
          }
          break;
        }

        setMessage("Verifying your new account key…");
        const payload = activationPayload(target, userId, challenge);
        const signed = mtpRaw.sign_data_value_with_keyring(
          mtpRaw.encode_data_value(payload),
          BigInt(userId),
          0x71,
          privateKeyring,
          mtpRaw.mtp_protection_signature_suite_dual(),
        );
        try {
          await client.request("RegisteringClientAuthenticate", {
            UserId: userId,
            ServerNonce: challenge,
            Signed: signed,
          });
          break;
        } catch (caught) {
          if (
            caught instanceof MTPProtocolError &&
            isActivationRouteUnavailable(caught)
          ) {
            setMessage(
              "The Iota moved; reconnecting through its current Omikron…",
            );
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            continue;
          }
          throw caught;
        }
      }
      if (!userId) throw new Error("Omega did not return the new account ID.");
      await persistMtpCredentials({
        storage: { load, save },
        userId,
        keyring: bytesToBase64(privateKeyring),
      });
      await save("mtp_reset_token", accountResetToken, { secure: true });
      await save("pending_invitation_registration", "", { secure: true });
      pendingRegistration.current = null;
      await navigate({ to: "/", replace: true });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Registration failed.",
      );
      client?.disconnect();
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    canDownloadKeyring: initialized && keyring.current !== null,
    credential,
    credentialReadOnly: initialTarget !== null,
    downloadKeyring: () => keyring.current && saveKeyringFile(keyring.current),
    initialized,
    message,
    setCredential,
    setUsername,
    submit,
    username,
  };
}
