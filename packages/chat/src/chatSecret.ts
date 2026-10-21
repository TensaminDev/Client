import { MTPProtocolError } from "mtp";
import type { useMTP } from "@tensamin/mtp";

export async function getChatSecretResponse(
  send: ReturnType<typeof useMTP>["send"],
  data: {
    UserId: string;
    ChatId: string;
    SecretId: string;
    VersionNumber?: number;
  },
) {
  let response;
  try {
    response = await send("GetChatSecret", data);
  } catch (error) {
    if (error instanceof MTPProtocolError && error.type === "ErrorNotSet") {
      return null;
    }
    throw error;
  }
  if (response.type === "ErrorNotSet") return null;
  if (response.type !== "ChatSecretResponse") {
    throw new MTPProtocolError(response);
  }
  const secret = response.data;
  if (
    secret.UserId !== data.UserId ||
    secret.ChatId !== data.ChatId ||
    secret.SecretId !== data.SecretId ||
    (data.VersionNumber !== undefined &&
      secret.VersionNumber !== data.VersionNumber)
  ) {
    throw new Error(
      "Chat secret response does not match the requested identity or epoch",
    );
  }
  return response;
}

export async function reconcileChatSecret<T>({
  ownUserId,
  peerId,
  getSecret,
  initialize,
  requestInitialization,
  isActive,
}: {
  ownUserId: number;
  peerId: number;
  getSecret: () => Promise<T | null>;
  initialize: () => Promise<T | null>;
  requestInitialization: () => Promise<void>;
  isActive: () => boolean;
}): Promise<T | null> {
  if (
    !Number.isSafeInteger(ownUserId) ||
    !Number.isSafeInteger(peerId) ||
    ownUserId <= 0 ||
    peerId <= 0 ||
    ownUserId === peerId
  ) {
    throw new Error("Invalid chat participants");
  }
  const secret = await getSecret();
  if (secret || !isActive()) return secret;

  const initialized = await initialize();
  if (initialized || !isActive()) return initialized;

  // For separate Iotas, only the lower-ID participant can publish. A shared
  // Iota can atomically accept either participant's initial envelopes.
  await requestInitialization();
  return null;
}

export async function publishInitialChatSecret<T>({
  publish,
  getSecret,
}: {
  publish: () => Promise<{ type: string; data: Record<string, unknown> }>;
  getSecret: () => Promise<T | null>;
}): Promise<T> {
  const response = await publish();
  if (response.type === "Success") return waitForChatSecret(getSecret);

  // Another client may have committed the immutable version first. Use only
  // the authenticated stored envelope, never the losing locally generated key.
  if (response.type === "ErrorInvalidData") {
    const winner = await getSecret();
    if (winner) return winner;
  }
  throw new MTPProtocolError({
    type: response.type,
    data:
      typeof response.data.ErrorType === "string"
        ? { ErrorType: response.data.ErrorType }
        : {},
  });
}

export async function waitForChatSecret<T>(
  getSecret: () => Promise<T | null>,
): Promise<T> {
  // A sealed relay send is not a storage commit acknowledgement. Poll only
  // after publishing, and never retry errors other than a missing record.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const secret = await getSecret();
    if (secret) return secret;
    if (attempt < 19) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Iota did not commit the requested chat secret version");
}
