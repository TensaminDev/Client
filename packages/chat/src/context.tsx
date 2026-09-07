import {
  createContext,
  useMemo,
  useEffect,
  useCallback,
  useState,
  useContext,
  type ReactNode,
  useRef,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { InfiniteData } from "@tanstack/react-query";
import type { LiveMessage, RawMessage, RawMessages } from "./values";
import {
  deriveChatId,
  deriveChatSecretId,
  decryptChatText,
  kemPublicKeyFromPublicKeyBundle,
  ownKemPublicKeyFromKeyring,
  randomChatSecret,
  unwrapChatSecret,
  wrapChatSecret,
} from "@tensamin/crypto/chatSecret";
import { useStorage } from "@tensamin/storage/context";
import { requireRelaySuccess, useMTP } from "@tensamin/mtp";
import { log, toast } from "@tensamin/shared/log";
import { useSession } from "@tensamin/identity/session";
import { useUser } from "@tensamin/identity/context";
import { createCache, type ChatDraft } from "@tensamin/cache";
import { secureValueCodec } from "@tensamin/storage/secure";
import { MTPProtocolError } from "mtp";

export const context = createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();
const CHAT_SECRET_VERSION = 1;

async function getChatSecretResponse(
  send: ReturnType<typeof useMTP>["send"],
  data: {
    UserId: string;
    ChatId: string;
    SecretId: string;
    VersionNumber?: number;
  },
) {
  try {
    const response = await send("GetChatSecret", data);
    return response.type === "ErrorNotSet" ? null : response;
  } catch (error) {
    if (error instanceof MTPProtocolError && error.type === "ErrorNotSet") {
      return null;
    }
    throw error;
  }
}

function bytesFromProtocol(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === "string") {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (
      entries.every(
        ([key, item]) => /^\d+$/.test(key) && typeof item === "number",
      )
    ) {
      return new Uint8Array(entries.map(([, item]) => item as number));
    }
  }
  throw new Error("expected protocol bytes");
}

type EditableMessage = RawMessage & { failed?: boolean };
type MessageEdit = Partial<
  Pick<
    EditableMessage,
    "Content" | "Edited" | "MessageState" | "Reactions" | "failed"
  >
>;

const messageStateRank: Record<RawMessage["MessageState"], number> = {
  awaiting: 0,
  sending: 0,
  sent: 1,
  received: 2,
  read: 3,
};

function updateMessagesBySendTime<T extends EditableMessage>(
  messages: T[],
  sendTime: number,
  edit: MessageEdit,
): { next: T[]; updated: boolean } {
  let updated = false;

  const next = messages.map((item) => {
    if (item.SendTime !== sendTime) {
      return item;
    }

    if (
      edit.MessageState !== undefined &&
      messageStateRank[edit.MessageState] < messageStateRank[item.MessageState]
    ) {
      return item;
    }

    const entries = Object.entries(edit) as Array<
      [keyof MessageEdit, MessageEdit[keyof MessageEdit]]
    >;

    if (entries.every(([key, value]) => item[key] === value)) {
      return item;
    }

    updated = true;
    return {
      ...item,
      ...edit,
    };
  });

  return {
    next,
    updated,
  };
}

function updateMessageReaction<T extends EditableMessage>(
  message: T,
  reaction: string,
  senderId: number,
  accepted: boolean,
): T {
  const current = message.Reactions ?? [];
  const withoutReaction = current.filter(
    (item) => item.Reaction !== reaction || item.SenderId !== senderId,
  );
  const next = accepted
    ? [...withoutReaction, { Reaction: reaction, SenderId: senderId }]
    : withoutReaction;

  if (
    next.length === current.length &&
    next.every(
      (item, index) =>
        item.Reaction === current[index]?.Reaction &&
        item.SenderId === current[index]?.SenderId,
    )
  ) {
    return message;
  }

  return { ...message, Reactions: next };
}

function updateMessageReactionBySendTime<T extends EditableMessage>(
  messages: T[],
  sendTime: number,
  reaction: string,
  senderId: number,
  accepted: boolean,
): { next: T[]; updated: boolean } {
  const index = messages.findIndex((message) => message.SendTime === sendTime);
  if (index === -1) return { next: messages, updated: false };

  const message = messages[index];
  const nextMessage = updateMessageReaction(
    message,
    reaction,
    senderId,
    accepted,
  );
  if (nextMessage === message) return { next: messages, updated: false };

  const next = [...messages];
  next[index] = nextMessage;
  return { next, updated: true };
}

function protocolBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

type SendMessageGet = (
  type: "MessageGet",
  data: { SendTime: number },
) => Promise<{ data: RawMessage }>;

type StoredDraftState = ChatDraft & {
  accountId: number;
  userId: number;
  loaded: boolean;
  revision: number;
};

function draftKey(accountId: number, userId: number) {
  return `${accountId}:${userId}`;
}

export async function getMessage({
  sendTime,
  ownId,
  chatPartnerId,
  send,
}: {
  sendTime: number;
  ownId: number;
  chatPartnerId: number;
  send: SendMessageGet;
}): Promise<RawMessage> {
  const cache = createCache(String(ownId), {
    codec: secureValueCodec,
  });
  const window = await cache.conversations.get(chatPartnerId);
  const cachedMessage = window?.Messages.find(
    (message) => message.SendTime === sendTime,
  );
  const message =
    cachedMessage ??
    (
      await send("MessageGet", {
        SendTime: sendTime,
      })
    ).data;
  const messageChatPartnerId =
    message.SenderId === ownId ? chatPartnerId : message.SenderId;

  if (messageChatPartnerId !== chatPartnerId) {
    throw new Error("Reply message does not belong to this chat");
  }

  return message;
}

export async function fetchReplyMessage({
  replyTo,
  ownId,
  chatUserId,
  currentChatSecret,
  currentChatSecretVersion,
  send,
  getChatSecret,
}: {
  replyTo: number;
  ownId: number;
  chatUserId: number;
  currentChatSecret?: Uint8Array | null;
  currentChatSecretVersion?: number;
  send: SendMessageGet;
  getChatSecret: (
    userId: number,
    version?: number,
  ) => Promise<Uint8Array | null>;
}) {
  const message = await getMessage({
    sendTime: replyTo,
    ownId,
    chatPartnerId: chatUserId,
    send,
  });
  const chatSecret =
    currentChatSecret && message.VersionNumber === currentChatSecretVersion
      ? currentChatSecret
      : await getChatSecret(chatUserId, message.VersionNumber);

  if (!chatSecret) {
    throw new Error("Missing chat secret");
  }

  const decryptedContent = await decryptChatText(
    chatSecret,
    message.Content,
    message.VersionNumber,
  );

  return {
    ...message,
    Content: decryptedContent,
  };
}

export default function Provider({ children }: { children: ReactNode }) {
  const { load } = useStorage();
  const { send, sendSealedRelay, subscribe, contextReady } = useMTP();
  const { getFresh: getFreshUser, getRelayIota } = useUser();
  const { insertContact, moveUserIdToTop } = useSession();

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [liveMessagesState, setLiveMessagesState] = useState<LiveMessage[]>([]);
  const [newMessagesStart, setNewMessagesStart] = useState<number | null>(null);
  const [ownId, setOwnId] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, StoredDraftState>>({});
  const draftsRef = useRef<Record<string, StoredDraftState>>({});
  const loadingDraftsRef = useRef(new Set<string>());
  const draftWriteQueuesRef = useRef(new Map<string, Promise<void>>());
  const secretInitializationsRef = useRef(
    new Map<string, Promise<Uint8Array | null>>(),
  );
  const [currentChatSecretState, setCurrentChatSecretState] = useState<{
    userId: number;
    value: Uint8Array | null;
    version: number;
  }>({
    userId: 0,
    value: null,
    version: 0,
  });

  const inputBoxRef = useRef<HTMLDivElement>(null);

  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });

  // User ID compare to clear shared secret
  const userIdValue = useMemo(() => {
    const rawId = (locationSearch as unknown as { id?: unknown })?.id;
    return Number(rawId ?? 0);
  }, [locationSearch]);

  const currentChatSecret = useMemo(() => {
    if (currentChatSecretState.userId !== userIdValue) {
      return null;
    }

    return currentChatSecretState.value;
  }, [currentChatSecretState, userIdValue]);

  useEffect(() => {
    load("user_id").then(setOwnId);
  }, [load]);

  const persistDraft = useCallback(
    (key: string, accountId: number, userId: number, draft: ChatDraft) => {
      const previous =
        draftWriteQueuesRef.current.get(key) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(async () => {
          const cache = createCache(String(accountId), {
            codec: secureValueCodec,
          });
          if (draft.Content === "" && draft.ReplyId === undefined) {
            await cache.drafts.delete(userId);
          } else {
            await cache.drafts.put(userId, draft);
          }
        })
        .catch((err) => {
          log(1, "chat", "red", "Failed to cache chat draft", err);
        });
      draftWriteQueuesRef.current.set(key, next);
    },
    [],
  );

  const updateDraft = useCallback(
    (
      accountId: number,
      userId: number,
      update: (current: ChatDraft) => ChatDraft,
    ) => {
      const key = draftKey(accountId, userId);
      const current = draftsRef.current[key] ?? {
        accountId,
        userId,
        Content: "",
        loaded: false,
        revision: 0,
      };
      const changed = update(current);
      const next: StoredDraftState = {
        ...current,
        ...changed,
        revision: current.revision + 1,
      };
      const nextDrafts = { ...draftsRef.current, [key]: next };
      draftsRef.current = nextDrafts;
      setDrafts(nextDrafts);

      if (next.loaded) {
        persistDraft(key, accountId, userId, {
          Content: next.Content,
          ReplyId: next.ReplyId,
        });
      }
    },
    [persistDraft],
  );

  useEffect(() => {
    if (
      !Number.isSafeInteger(ownId) ||
      ownId <= 0 ||
      !Number.isSafeInteger(userIdValue) ||
      userIdValue <= 0
    ) {
      return;
    }

    const key = draftKey(ownId, userIdValue);
    if (draftsRef.current[key]?.loaded || loadingDraftsRef.current.has(key)) {
      return;
    }
    loadingDraftsRef.current.add(key);

    void (async () => {
      let stored: ChatDraft | undefined;
      try {
        stored = await createCache(String(ownId), {
          codec: secureValueCodec,
        }).drafts.get(userIdValue);
      } catch (err) {
        log(1, "chat", "red", "Failed to restore chat draft", err);
      } finally {
        const current = draftsRef.current[key];
        const next: StoredDraftState =
          current && current.revision > 0
            ? { ...current, loaded: true }
            : {
                accountId: ownId,
                userId: userIdValue,
                Content: stored?.Content ?? "",
                ReplyId: stored?.ReplyId,
                loaded: true,
                revision: 0,
              };
        const nextDrafts = { ...draftsRef.current, [key]: next };
        draftsRef.current = nextDrafts;
        setDrafts(nextDrafts);
        loadingDraftsRef.current.delete(key);

        if (next.revision > 0) {
          persistDraft(key, ownId, userIdValue, {
            Content: next.Content,
            ReplyId: next.ReplyId,
          });
        }
      }
    })();
  }, [ownId, persistDraft, userIdValue]);

  const activeDraftKey =
    ownId > 0 && userIdValue > 0 ? draftKey(ownId, userIdValue) : undefined;
  const activeDraft = activeDraftKey ? drafts[activeDraftKey] : undefined;
  const composerValue = activeDraft?.Content ?? "";
  const replyTo = activeDraft?.ReplyId;
  const setComposerValue = useCallback(
    (value: string) => {
      if (ownId <= 0 || userIdValue <= 0) return;
      updateDraft(ownId, userIdValue, (current) => ({
        ...current,
        Content: value,
      }));
    },
    [ownId, updateDraft, userIdValue],
  );
  const setReplyTo = useCallback(
    (value: number | undefined) => {
      if (ownId <= 0 || userIdValue <= 0) return;
      updateDraft(ownId, userIdValue, (current) => ({
        ...current,
        ReplyId: value,
      }));
    },
    [ownId, updateDraft, userIdValue],
  );

  const getChatSecretState = useCallback(
    async (
      userId: number,
      version?: number,
    ): Promise<{ value: Uint8Array; version: number } | null> => {
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid chat user id");
      }

      const ownUserId = Number(await load("user_id"));
      const keyring = await load("mtp_keyring");
      const chatId = deriveChatId(ownUserId, userId);
      const secretId = deriveChatSecretId(chatId);

      const response = await getChatSecretResponse(send, {
        UserId: String(ownUserId),
        ChatId: chatId,
        SecretId: secretId,
        ...(version !== undefined && { VersionNumber: version }),
      });

      if (!response) {
        return null;
      }

      if (response.type.startsWith("Error")) {
        throw new Error(`GetChatSecret failed: ${response.type}`);
      }

      const data = response.data as Record<string, unknown>;
      return {
        value: await unwrapChatSecret({
          encryptedSecret: bytesFromProtocol(data.EncryptedSecret),
          kemCiphertext: bytesFromProtocol(data.KemCiphertext),
          keyring,
          chatId: String(data.ChatId),
          secretId: String(data.SecretId),
          version: Number(data.VersionNumber),
          wrappingScheme: String(data.WrappingScheme),
        }),
        version: Number(data.VersionNumber),
      };
    },
    [load, send],
  );

  const getChatSecret = useCallback(
    async (userId: number, version?: number): Promise<Uint8Array | null> => {
      return (await getChatSecretState(userId, version))?.value ?? null;
    },
    [getChatSecretState],
  );

  const waitForChatSecret = useCallback(
    async (peerId: number, version: number): Promise<Uint8Array> => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const secret = await getChatSecret(peerId, version);
        if (secret) return secret;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Iota did not commit the requested chat secret version");
    },
    [getChatSecret],
  );

  const createInitialChatSecret = useCallback(
    (
      peerId: number,
      shouldCheckExisting = true,
    ): Promise<Uint8Array | null> => {
      const inFlight = secretInitializationsRef.current.get(String(peerId));
      if (inFlight) return inFlight;

      const initialization = (async (): Promise<Uint8Array | null> => {
        const ownUserId = Number(await load("user_id"));
        if (ownUserId !== Math.min(ownUserId, peerId)) return null;

        if (shouldCheckExisting) {
          const existing = await getChatSecret(peerId, CHAT_SECRET_VERSION);
          if (existing) return existing;
        }
        const chatId = deriveChatId(ownUserId, peerId);
        const secretId = deriveChatSecretId(chatId);

        const keyring = await load("mtp_keyring");
        const rawSecret = randomChatSecret();
        const ownWrapped = await wrapChatSecret({
          chatSecret: rawSecret,
          recipientKemPublicKey: ownKemPublicKeyFromKeyring(keyring),
          chatId,
          secretId,
          version: CHAT_SECRET_VERSION,
        });
        const peerUser = await getFreshUser(peerId, ["PublicKey"]);
        const peerWrapped = await wrapChatSecret({
          chatSecret: rawSecret,
          recipientKemPublicKey: kemPublicKeyFromPublicKeyBundle(
            peerUser.PublicKey,
          ),
          chatId,
          secretId,
          version: CHAT_SECRET_VERSION,
        });
        const [ownIota, peerIota] = await Promise.all([
          getRelayIota(ownUserId),
          getRelayIota(peerId),
        ]);

        requireRelaySuccess(
          await sendSealedRelay(
            "SetChatSecret",
            {
              ChatId: chatId,
              SecretId: secretId,
              VersionNumber: CHAT_SECRET_VERSION,
              WrappingScheme: ownWrapped.wrappingScheme,
              CreatedAt: Date.now(),
              Recipients: [
                {
                  UserId: String(ownUserId),
                  EncryptedSecret: protocolBytes(ownWrapped.encryptedSecret),
                  KemCiphertext: protocolBytes(ownWrapped.kemCiphertext),
                },
                {
                  UserId: String(peerId),
                  EncryptedSecret: protocolBytes(peerWrapped.encryptedSecret),
                  KemCiphertext: protocolBytes(peerWrapped.kemCiphertext),
                },
              ],
            },
            {
              nextHop: { kind: "iota", id: ownIota.IotaId },
              finalRecipientId: peerId,
              metadataRecipients: [
                { value: ownIota.PublicKey, encoding: "base64" },
                { value: peerIota.PublicKey, encoding: "base64" },
              ],
              contentRecipients: [
                { value: ownIota.PublicKey, encoding: "base64" },
                { value: peerIota.PublicKey, encoding: "base64" },
              ],
            },
          ),
        );
        return await waitForChatSecret(peerId, CHAT_SECRET_VERSION);
      })();
      secretInitializationsRef.current.set(String(peerId), initialization);
      const clearInitialization = () => {
        if (
          secretInitializationsRef.current.get(String(peerId)) ===
          initialization
        ) {
          secretInitializationsRef.current.delete(String(peerId));
        }
      };
      void initialization.then(clearInitialization, clearInitialization);
      return initialization;
    },
    [
      getChatSecret,
      getRelayIota,
      getFreshUser,
      load,
      sendSealedRelay,
      waitForChatSecret,
    ],
  );

  useEffect(() => {
    if (!contextReady || userIdValue <= 0) return;

    let active = true;
    void (async () => {
      try {
        setError("");
        setErrorDescription("");
        const ownUserId = Number(await load("user_id"));
        let secret = await getChatSecretState(userIdValue);

        if (!secret && ownUserId === Math.min(ownUserId, userIdValue)) {
          const value = await createInitialChatSecret(userIdValue, false);
          secret = value ? { value, version: CHAT_SECRET_VERSION } : null;
        }

        for (let attempt = 0; active && !secret && attempt < 20; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          secret = await getChatSecretState(userIdValue);
        }

        if (active && secret) {
          setCurrentChatSecretState({
            userId: userIdValue,
            value: secret.value,
            version: secret.version,
          });
        }
      } catch (err) {
        log(1, "chat", "red", "Failed to reconcile chat secret", err);
        if (active) {
          setError(err instanceof Error ? err.name : "Unknown Error");
          setErrorDescription(err instanceof Error ? err.message : String(err));
          setCurrentChatSecretState({
            userId: userIdValue,
            value: null,
            version: 0,
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [
    contextReady,
    createInitialChatSecret,
    getChatSecretState,
    load,
    userIdValue,
  ]);

  useEffect(() => {
    return subscribe("ChatSecretForward", ({ data }) => {
      const senderId = Number(data.SenderUserId);
      const recipientId = Number(data.RecipientUserId);
      if (
        !Number.isSafeInteger(senderId) ||
        !Number.isSafeInteger(recipientId) ||
        recipientId <= 0 ||
        recipientId !== ownId ||
        senderId === ownId
      ) {
        return;
      }

      insertContact(senderId);

      if (data.Payload === "init") {
        void createInitialChatSecret(senderId).catch((error) => {
          log(
            1,
            "chat",
            "red",
            "Failed to initialize requested chat secret",
            error,
          );
        });
        return;
      }

      if (senderId !== userIdValue) return;

      void getChatSecret(senderId, data.VersionNumber)
        .then((secret) => {
          if (!secret) throw new Error("committed chat secret is unavailable");
          setCurrentChatSecretState((current) => {
            if (
              current.userId === senderId &&
              current.version >= data.VersionNumber
            ) {
              return current;
            }
            return {
              userId: senderId,
              value: secret,
              version: data.VersionNumber,
            };
          });
        })
        .catch((error) => {
          log(1, "chat", "red", "Failed to load committed chat secret", error);
        });
    });
  }, [
    createInitialChatSecret,
    getChatSecret,
    insertContact,
    ownId,
    subscribe,
    userIdValue,
  ]);

  const decryptMessages = useCallback(
    async (messages: RawMessages) => {
      return Promise.all(
        messages.map(async (message) => {
          try {
            const secret =
              message.VersionNumber === currentChatSecretState.version
                ? currentChatSecret
                : await getChatSecret(userIdValue, message.VersionNumber);
            if (!secret) throw new Error("missing message key epoch");
            return {
              ...message,
              Content: await decryptChatText(
                secret,
                message.Content,
                message.VersionNumber,
              ),
            };
          } catch (err) {
            log(1, "chat", "red", "Failed to decrypt historical message", err, {
              SendTime: message.SendTime,
            });
            return {
              ...message,
              Content: "Failed to decrypt message",
              decryptionFailed: true,
            };
          }
        }),
      );
    },
    [
      currentChatSecret,
      currentChatSecretState.version,
      getChatSecret,
      userIdValue,
    ],
  );

  const getCachedMessages = useCallback(async () => {
    if (!ownId || !userIdValue || !currentChatSecret) return [];
    const cache = createCache(String(ownId), {
      codec: secureValueCodec,
    });
    const window = await cache.conversations.get(userIdValue);
    return decryptMessages(window?.Messages ?? []);
  }, [currentChatSecret, decryptMessages, ownId, userIdValue]);

  const getMessages = useCallback(
    async (amount: number, offset: number) => {
      if (!currentChatSecret) {
        return [];
      }

      const messages = await send("MessagesGet", {
        Amount: amount,
        Offset: offset,
        UserId: userIdValue,
      });

      if (messages.type.startsWith("error")) {
        throw new Error(messages.type);
      }

      const rawMessages = messages.data.Messages;
      const sorted = [...rawMessages].sort((a, b) => a.SendTime - b.SendTime);

      if (sorted.length > 0) {
        const fetchedSendTimes = new Set(sorted.map((item) => item.SendTime));

        setLiveMessagesState((prev) => {
          const filtered = prev.filter(
            (liveMessage) => !fetchedSendTimes.has(liveMessage.SendTime),
          );

          return filtered.length === prev.length ? prev : filtered;
        });
      }

      return decryptMessages(sorted);
    },
    [currentChatSecret, decryptMessages, send, userIdValue],
  );

  useEffect(() => {
    if (!currentChatSecret || !ownId || !userIdValue) return;
    const queryKey = ["chat-messages", String(userIdValue), true] as const;
    void getCachedMessages().then((messages) => {
      if (messages.length === 0 || queryClient.getQueryData(queryKey)) return;
      queryClient.setQueryData<InfiniteData<RawMessages>>(queryKey, {
        pages: [messages],
        pageParams: [0],
      });
    });
  }, [currentChatSecret, getCachedMessages, ownId, userIdValue]);

  const editMessage = useCallback(
    (sendTime: number, edit: MessageEdit) => {
      setLiveMessagesState((prev) => {
        const { next, updated } = updateMessagesBySendTime(
          prev,
          sendTime,
          edit,
        );
        return updated ? next : prev;
      });

      const queryKey = [
        "chat-messages",
        String(userIdValue),
        currentChatSecret !== null,
      ] as const;
      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) => {
          if (!current) {
            return current;
          }

          let updated = false;

          const pages = current.pages.map((page) => {
            const nextPage = updateMessagesBySendTime(page, sendTime, edit);

            if (nextPage.updated) {
              updated = true;
            }

            return nextPage.next;
          });

          if (!updated) {
            return current;
          }

          return {
            ...current,
            pages,
          };
        },
      );
    },
    [currentChatSecret, userIdValue],
  );

  const removeMessage = useCallback(
    (sendTime: number) => {
      setLiveMessagesState((prev) =>
        prev.filter((message) => message.SendTime !== sendTime),
      );
      const queryKey = [
        "chat-messages",
        String(userIdValue),
        currentChatSecret !== null,
      ] as const;

      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) => {
          if (!current) {
            return current;
          }

          let updated = false;

          const pages = current.pages.map((page) => {
            const nextPage = page.filter((message) => {
              const keep = message.SendTime !== sendTime;
              if (!keep) {
                updated = true;
              }
              return keep;
            });

            return nextPage;
          });

          if (!updated) {
            return current;
          }

          return {
            ...current,
            pages,
          };
        },
      );
    },
    [currentChatSecret, userIdValue],
  );

  const applyLiveReaction = useCallback(
    (
      sendTime: number,
      reaction: string,
      senderId: number,
      accepted: boolean,
    ) => {
      setLiveMessagesState((current) => {
        const { next, updated } = updateMessageReactionBySendTime(
          current,
          sendTime,
          reaction,
          senderId,
          accepted,
        );
        return updated ? next : current;
      });

      const queryKey = [
        "chat-messages",
        String(userIdValue),
        currentChatSecret !== null,
      ] as const;
      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) => {
          if (!current) return current;

          let updated = false;
          const pages = current.pages.map((page) => {
            const nextPage = updateMessageReactionBySendTime(
              page,
              sendTime,
              reaction,
              senderId,
              accepted,
            );
            updated ||= nextPage.updated;
            return nextPage.next;
          });

          return updated ? { ...current, pages } : current;
        },
      );
    },
    [currentChatSecret, userIdValue],
  );

  const deleteMessage = useCallback(
    async (sendTime: number) => {
      try {
        const [ownIota, peerIota] = await Promise.all([
          getRelayIota(ownId),
          getRelayIota(userIdValue),
        ]);
        const response = await sendSealedRelay(
          "MessageDelete",
          { ChatPartnerId: userIdValue, SendTime: sendTime },
          {
            nextHop: { kind: "iota", id: ownIota.IotaId },
            finalRecipientId: userIdValue,
            metadataRecipients: [
              { value: ownIota.PublicKey, encoding: "base64" },
              { value: peerIota.PublicKey, encoding: "base64" },
            ],
            contentRecipients: [
              { value: ownIota.PublicKey, encoding: "base64" },
              { value: peerIota.PublicKey, encoding: "base64" },
            ],
          },
        );
        requireRelaySuccess(response);
        removeMessage(sendTime);
      } catch (err) {
        log(1, "chat", "red", "Failed to delete message", err);
        toast("error", "Failed to delete message", String(err));
      }
    },
    [getRelayIota, ownId, removeMessage, sendSealedRelay, userIdValue],
  );

  const setReaction = useCallback(
    async (sendTime: number, reaction: string, add: boolean) => {
      let previousReactions: RawMessage["Reactions"];
      let foundMessage = false;

      const rememberPreviousReactions = (messages: EditableMessage[]) => {
        const message = messages.find((item) => item.SendTime === sendTime);
        if (!message) return;

        previousReactions ??= message.Reactions;
        foundMessage = true;
      };

      setLiveMessagesState((current) => {
        rememberPreviousReactions(current);
        const { next, updated } = updateMessageReactionBySendTime(
          current,
          sendTime,
          reaction,
          ownId,
          add,
        );
        return updated ? next : current;
      });

      const queryKey = [
        "chat-messages",
        String(userIdValue),
        currentChatSecret !== null,
      ] as const;
      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) => {
          if (!current) return current;

          let updated = false;
          const pages = current.pages.map((page) => {
            rememberPreviousReactions(page);
            const nextPage = updateMessageReactionBySendTime(
              page,
              sendTime,
              reaction,
              ownId,
              add,
            );
            updated ||= nextPage.updated;
            return nextPage.next;
          });

          return updated ? { ...current, pages } : current;
        },
      );

      try {
        const [ownIota, peerIota] = await Promise.all([
          getRelayIota(ownId),
          getRelayIota(userIdValue),
        ]);
        await sendSealedRelay(
          add ? "MessageReactionAdd" : "MessageReactionRemove",
          {
            ChatPartnerId: userIdValue,
            Reaction: reaction,
            SendTime: sendTime,
          },
          {
            nextHop: { kind: "iota", id: ownIota.IotaId },
            finalRecipientId: userIdValue,
            metadataRecipients: [
              { value: ownIota.PublicKey, encoding: "base64" },
              { value: peerIota.PublicKey, encoding: "base64" },
            ],
            contentRecipients: [
              { value: ownIota.PublicKey, encoding: "base64" },
              { value: peerIota.PublicKey, encoding: "base64" },
            ],
          },
        );
      } catch (err) {
        if (foundMessage) {
          editMessage(sendTime, { Reactions: previousReactions });
        }
        log(1, "chat", "red", "Failed to update reaction", err);
        toast("error", "Failed to update reaction", String(err));
      }
    },
    [
      currentChatSecret,
      editMessage,
      getRelayIota,
      ownId,
      sendSealedRelay,
      userIdValue,
    ],
  );

  const addReaction = useCallback(
    (sendTime: number, reaction: string) =>
      setReaction(sendTime, reaction, true),
    [setReaction],
  );
  const removeReaction = useCallback(
    (sendTime: number, reaction: string) =>
      setReaction(sendTime, reaction, false),
    [setReaction],
  );

  const addLiveMessage = useCallback(
    (message: RawMessage, markAsNew = false) => {
      const localId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (message.SenderId !== ownId) {
        moveUserIdToTop(userIdValue);
      }

      if (markAsNew) {
        setNewMessagesStart((current) =>
          current === null
            ? message.SendTime
            : Math.min(current, message.SendTime),
        );
      }

      setLiveMessagesState((prev) => [
        ...prev,
        {
          ...message,
          localId,
          failed: false,
        },
      ]);

      return {
        setFailed: (failed: boolean) => {
          editMessage(message.SendTime, { failed });
        },
        setMessageState: (MessageState: RawMessage["MessageState"]) => {
          editMessage(message.SendTime, { MessageState });
        },
      };
    },
    [editMessage, userIdValue, moveUserIdToTop, ownId],
  );

  const clearLiveMessages = useCallback(() => {
    setLiveMessagesState([]);
    setNewMessagesStart(null);
  }, []);

  // Get live updates for message states
  useEffect(() => {
    const unsubscribeEdit = subscribe("MessageEditLive", ({ data }) => {
      if (!currentChatSecret) return;
      if (data.ChatPartnerId !== userIdValue) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message edit update due to user ID mismatch",
          {
            expected: userIdValue,
            received: data.ChatPartnerId,
          },
        );
        return;
      }

      void getChatSecret(userIdValue, data.VersionNumber)
        .then((secret) => {
          if (!secret) throw new Error("missing edit key epoch");
          return decryptChatText(secret, data.Content, data.VersionNumber);
        })
        .then((content) => {
          editMessage(data.SendTime, { Content: content, Edited: true });
        })
        .catch((err) => {
          log(1, "chat", "red", "Failed to decrypt message edit", err, {
            SendTime: data.SendTime,
          });
        });
    });
    const unsubscribeReaction = subscribe("MessageReactionLive", ({ data }) => {
      if (data.ChatPartnerId !== userIdValue) return;
      applyLiveReaction(
        data.SendTime,
        data.Reaction,
        data.SenderId,
        data.Accepted,
      );
    });
    const unsubscribeDelete = subscribe("MessageDeleteLive", ({ data }) => {
      if (data.ChatPartnerId !== userIdValue) return;
      removeMessage(data.SendTime);
    });
    const unsubscribeState = subscribe("MessageState", ({ data }) => {
      if (data.ChatPartnerId !== userIdValue) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message state update due to user ID mismatch",
          {
            expected: userIdValue,
            received: data.ChatPartnerId,
          },
        );
        return;
      }
      editMessage(data.SendTime, { MessageState: data.MessageState });
    });
    return () => {
      unsubscribeEdit();
      unsubscribeReaction();
      unsubscribeDelete();
      unsubscribeState();
    };
  }, [
    currentChatSecret,
    applyLiveReaction,
    editMessage,
    getChatSecret,
    removeMessage,
    subscribe,
    userIdValue,
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          getMessages,
          getChatSecret,
          liveMessages: () => liveMessagesState,
          newMessagesStart,
          addLiveMessage,
          editMessage,
          deleteMessage,
          addReaction,
          removeReaction,
          clearLiveMessages,
          chatSecret: currentChatSecret,
          chatSecretVersion: currentChatSecretState.version,
          ensureChatSecret: createInitialChatSecret,
          ownId,
          userId: userIdValue,
          inputBoxRef,
          error,
          errorDescription,
          composerValue,
          setComposerValue,
          replyTo,
          setReplyTo,
        }}
      >
        {children}
      </context.Provider>
    </QueryClientProvider>
  );
}

type contextType = {
  getMessages: (amount: number, offset: number) => Promise<RawMessages>;
  getChatSecret: (
    userId: number,
    version?: number,
  ) => Promise<Uint8Array | null>;
  liveMessages: () => LiveMessage[];
  newMessagesStart: number | null;
  addLiveMessage: (
    message: RawMessage,
    markAsNew?: boolean,
  ) => {
    setFailed: (failed: boolean) => void;
    setMessageState: (messageState: RawMessage["MessageState"]) => void;
  };
  editMessage: (sendTime: number, edit: MessageEdit) => void;
  deleteMessage: (sendTime: number) => void;
  addReaction: (sendTime: number, reaction: string) => Promise<void>;
  removeReaction: (sendTime: number, reaction: string) => Promise<void>;
  clearLiveMessages: () => void;
  chatSecret: Uint8Array | null;
  chatSecretVersion: number;
  ensureChatSecret: (userId: number) => Promise<Uint8Array | null>;
  ownId: number;
  userId: number;
  inputBoxRef: React.RefObject<HTMLDivElement | null>;
  error: string;
  errorDescription: string;
  composerValue: string;
  setComposerValue: (value: string) => void;
  replyTo: number | undefined;
  setReplyTo: (value: number | undefined) => void;
};

export function useChat(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}

export function useReplyMessage() {
  const { send } = useMTP();
  const { load } = useStorage();
  const {
    chatSecret,
    chatSecretVersion,
    replyTo,
    setReplyTo,
    getChatSecret,
    userId,
  } = useChat();
  const [ownId, setOwnId] = useState(0);
  const [replyMessage, setReplyMessage] = useState<RawMessage | undefined>();

  const handleReplyError = useCallback(
    (err: unknown) => {
      log(1, "chat", "red", "Failed to get reply message", err);
      toast("error", "Failed to get reply message", String(err));
      setReplyTo(undefined);
      setReplyMessage(undefined);
    },
    [setReplyTo],
  );

  useEffect(() => {
    void load("user_id").then((value) => {
      setOwnId(Number(value));
    });
  }, [load]);

  useEffect(() => {
    if (!replyTo || !ownId) {
      setReplyMessage(undefined);
      return;
    }

    let active = true;
    setReplyMessage(undefined);

    void fetchReplyMessage({
      replyTo,
      ownId,
      chatUserId: userId,
      currentChatSecret: chatSecret,
      currentChatSecretVersion: chatSecretVersion,
      send,
      getChatSecret,
    })
      .then((message) => {
        if (active) {
          setReplyMessage(message);
        }
      })
      .catch((err) => {
        if (active) {
          handleReplyError(err);
        }
      });

    return () => {
      active = false;
    };
  }, [
    chatSecret,
    chatSecretVersion,
    getChatSecret,
    handleReplyError,
    ownId,
    replyTo,
    send,
    userId,
  ]);

  return {
    ownId,
    replyTo,
    replyMessage,
    replyUserId: replyMessage?.SenderId,
  };
}
