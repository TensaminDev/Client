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
import { useMTP } from "@tensamin/mtp";
import { log, toast } from "@tensamin/shared/log";
import { useSession } from "@tensamin/storage/session";
import { useUser } from "@tensamin/user/context";
import { createCache } from "@tensamin/cache";
import { secureValueCodec } from "@tensamin/storage/secure";

export const context = createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();
const CHAT_SECRET_VERSION = 1;

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

function assertProtocolSuccess(type: string, response: { type: string }) {
  if (response.type.startsWith("Error")) {
    throw new Error(`${type} failed: ${response.type}`);
  }
}

function protocolBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

type SendMessageGet = (
  type: "MessageGet",
  data: { SendTime: number },
) => Promise<{ data: RawMessage }>;

type GetChatSecret = (userId: number) => Promise<Uint8Array | null>;

export async function fetchReplyMessage({
  replyTo,
  send,
  getChatSecret,
}: {
  replyTo: number;
  ownId: number;
  chatUserId: number;
  send: SendMessageGet;
  getChatSecret: GetChatSecret;
}) {
  const value = await send("MessageGet", {
    SendTime: replyTo,
  });
  const chatSecret = await getChatSecret(value.data.SenderId);

  if (!chatSecret) {
    throw new Error("Missing chat secret");
  }

  const decryptedContent = await decryptChatText(
    chatSecret,
    value.data.Content,
  );

  return {
    ...value.data,
    Content: decryptedContent,
  };
}

export default function Provider({ children }: { children: ReactNode }) {
  const { load } = useStorage();
  const { send, subscribePush } = useMTP();
  const { get: getUser } = useUser();
  const { moveUserIdToTop } = useSession();

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [liveMessagesState, setLiveMessagesState] = useState<LiveMessage[]>([]);
  const [ownId, setOwnId] = useState(0);
  const [currentChatSecretState, setCurrentChatSecretState] = useState<{
    userId: number;
    value: Uint8Array | null;
  }>({
    userId: 0,
    value: null,
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

  useEffect(() => {
    if (!userIdValue) return;

    let active = true;

    void (async () => {
      try {
        setError("");
        setErrorDescription("");

        const ownUserId = Number(await load("user_id"));
        const keyring = await load("mtp_keyring");
        const chatId = deriveChatId(ownUserId, userIdValue);
        const secretId = deriveChatSecretId(chatId);

        const existing = await send("GetChatSecret", {
          UserId: String(ownUserId),
          ChatId: chatId,
          SecretId: secretId,
        });

        if (!existing.type.startsWith("Error")) {
          const data = existing.data as Record<string, unknown>;
          const secret = await unwrapChatSecret({
            encryptedSecret: bytesFromProtocol(data.EncryptedSecret),
            kemCiphertext: bytesFromProtocol(data.KemCiphertext),
            keyring,
            chatId: String(data.ChatId),
            secretId: String(data.SecretId),
            version: Number(data.VersionNumber),
            wrappingScheme: String(data.WrappingScheme),
          });

          if (active) {
            setCurrentChatSecretState({ userId: userIdValue, value: secret });
          }
          return;
        }

        if (existing.type !== "ErrorNotSet") {
          throw new Error(`GetChatSecret failed: ${existing.type}`);
        }

        const rawSecret = randomChatSecret();
        const ownWrapped = await wrapChatSecret({
          chatSecret: rawSecret,
          recipientKemPublicKey: ownKemPublicKeyFromKeyring(keyring),
          chatId,
          secretId,
          version: CHAT_SECRET_VERSION,
        });
        const peerUser = await getUser(userIdValue);
        const peerWrapped = await wrapChatSecret({
          chatSecret: rawSecret,
          recipientKemPublicKey: kemPublicKeyFromPublicKeyBundle(
            peerUser.PublicKey,
          ),
          chatId,
          secretId,
          version: CHAT_SECRET_VERSION,
        });

        assertProtocolSuccess(
          "SetChatSecret",
          await send("SetChatSecret", {
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
                UserId: String(userIdValue),
                EncryptedSecret: protocolBytes(peerWrapped.encryptedSecret),
                KemCiphertext: protocolBytes(peerWrapped.kemCiphertext),
              },
            ],
          }),
        );

        if (active) {
          setCurrentChatSecretState({ userId: userIdValue, value: rawSecret });
        }
      } catch (err) {
        log(1, "chat", "red", "Failed to initialize chat secret", err);
        if (active) {
          setError(err instanceof Error ? err.name : "Unknown Error");
          setErrorDescription(err instanceof Error ? err.message : String(err));
          setCurrentChatSecretState({ userId: userIdValue, value: null });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [getUser, load, send, userIdValue]);

  const getChatSecret = useCallback(
    async (userId: number): Promise<Uint8Array | null> => {
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid chat user id");
      }

      const ownUserId = Number(await load("user_id"));
      const keyring = await load("mtp_keyring");
      const chatId = deriveChatId(ownUserId, userId);
      const secretId = deriveChatSecretId(chatId);

      const response = await send("GetChatSecret", {
        UserId: String(ownUserId),
        ChatId: chatId,
        SecretId: secretId,
      });

      if (response.type === "ErrorNotSet") {
        return null;
      }

      if (response.type.startsWith("Error")) {
        throw new Error(`GetChatSecret failed: ${response.type}`);
      }

      const data = response.data as Record<string, unknown>;
      return await unwrapChatSecret({
        encryptedSecret: bytesFromProtocol(data.EncryptedSecret),
        kemCiphertext: bytesFromProtocol(data.KemCiphertext),
        keyring,
        chatId: String(data.ChatId),
        secretId: String(data.SecretId),
        version: Number(data.VersionNumber),
        wrappingScheme: String(data.WrappingScheme),
      });
    },
    [load, send],
  );

  const decryptMessages = useCallback(
    async (messages: RawMessages) => {
      if (!currentChatSecret) return [];
      return Promise.all(
        messages.map(async (message) => {
          try {
            return {
              ...message,
              Content: await decryptChatText(
                currentChatSecret,
                message.Content,
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
    [currentChatSecret],
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

  const deleteMessage = useCallback(
    async (sendTime: number) => {
      try {
        const response = await send("MessageDelete", {
          ChatPartnerId: userIdValue,
          SendTime: sendTime,
        });

        assertProtocolSuccess("MessageDelete", response);
        removeMessage(sendTime);
      } catch (err) {
        log(1, "chat", "red", "Failed to delete message", err);
        toast("error", "Failed to delete message", String(err));
      }
    },
    [removeMessage, send, userIdValue],
  );

  const setReaction = useCallback(
    async (sendTime: number, reaction: string, add: boolean) => {
      let previousReactions: RawMessage["Reactions"];
      let foundMessage = false;

      const applyOptimisticUpdate = (message: EditableMessage) => {
        const current = message.Reactions ?? [];
        previousReactions = current;
        foundMessage = true;

        return add
          ? [...current, { Reaction: reaction, SenderId: ownId }]
          : current.filter(
              (item) => item.Reaction !== reaction || item.SenderId !== ownId,
            );
      };

      setLiveMessagesState((current) =>
        current.map((message) =>
          message.SendTime === sendTime
            ? { ...message, Reactions: applyOptimisticUpdate(message) }
            : message,
        ),
      );

      const queryKey = [
        "chat-messages",
        String(userIdValue),
        currentChatSecret !== null,
      ] as const;
      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) =>
                  page.map((message) =>
                    message.SendTime === sendTime
                      ? {
                          ...message,
                          Reactions: applyOptimisticUpdate(message),
                        }
                      : message,
                  ),
                ),
              }
            : current,
      );

      try {
        const response = await send(
          add ? "MessageReactionAdd" : "MessageReactionRemove",
          {
            ChatPartnerId: userIdValue,
            Reaction: reaction,
            SendTime: sendTime,
          },
        );
        assertProtocolSuccess(
          add ? "MessageReactionAdd" : "MessageReactionRemove",
          response,
        );
      } catch (err) {
        if (foundMessage) {
          editMessage(sendTime, { Reactions: previousReactions });
        }
        log(1, "chat", "red", "Failed to update reaction", err);
        toast("error", "Failed to update reaction", String(err));
      }
    },
    [currentChatSecret, editMessage, ownId, send, userIdValue],
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
    (message: RawMessage) => {
      const localId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (message.SenderId !== ownId) {
        moveUserIdToTop(userIdValue);
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
      };
    },
    [editMessage, userIdValue, moveUserIdToTop, ownId],
  );

  const clearLiveMessages = useCallback(() => {
    setLiveMessagesState([]);
  }, []);

  // Get live updates for message states
  useEffect(() => {
    return subscribePush((message) => {
      if (message.type === "MessageEditLive") {
        if (!currentChatSecret) return;

        const rawData = message.data as {
          ChatPartnerId: unknown;
          SendTime: unknown;
          Content: string;
        };

        const chatPartnerId = Number(rawData.ChatPartnerId);
        const sendTime = Number(rawData.SendTime);

        if (!Number.isFinite(chatPartnerId) || !Number.isFinite(sendTime)) {
          log(
            3,
            "chat",
            "yellow",
            "Cancel message edit update due to invalid data",
          );
          return;
        }

        if (chatPartnerId !== userIdValue) {
          log(
            3,
            "chat",
            "yellow",
            "Cancel message edit update due to user ID mismatch",
            {
              expected: userIdValue,
              received: chatPartnerId,
            },
          );
          return;
        }

        void decryptChatText(currentChatSecret, rawData.Content)
          .then((content) => {
            editMessage(sendTime, { Content: content, Edited: true });
          })
          .catch((err) => {
            log(1, "chat", "red", "Failed to decrypt message edit", err, {
              SendTime: sendTime,
            });
          });
        return;
      }

      if (message.type === "MessageReactionLive") {
        const rawData = message.data as {
          ChatPartnerId: unknown;
          SendTime: unknown;
        };
        const chatPartnerId = Number(rawData.ChatPartnerId);
        const sendTime = Number(rawData.SendTime);

        if (chatPartnerId !== userIdValue || !Number.isFinite(sendTime)) return;

        void send("MessageGet", { SendTime: sendTime })
          .then((response) => {
            assertProtocolSuccess("MessageGet", response);
            editMessage(sendTime, { Reactions: response.data.Reactions ?? [] });
          })
          .catch((err) => {
            log(1, "chat", "red", "Failed to refresh message reactions", err);
          });
        return;
      }

      if (message.type === "MessageDeleteLive") {
        const data = message.data as {
          ChatPartnerId: number;
          SendTime: number;
        };

        if (data.ChatPartnerId !== userIdValue) return;

        removeMessage(data.SendTime);
        return;
      }

      if (message.type !== "MessageState") return;

      const rawData = message.data as {
        ChatPartnerId: unknown;
        SendTime: unknown;
        MessageState: RawMessage["MessageState"];
      };

      const nextState = {
        ChatPartnerId: Number(rawData.ChatPartnerId),
        SendTime: Number(rawData.SendTime),
        MessageState: rawData.MessageState,
      };

      if (
        !Number.isFinite(nextState.ChatPartnerId) ||
        !Number.isFinite(nextState.SendTime)
      ) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message state update due to invalid data",
        );
        return;
      }

      if (nextState.ChatPartnerId !== userIdValue) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message state update due to user ID mismatch",
          {
            expected: userIdValue,
            received: nextState.ChatPartnerId,
          },
        );
        return;
      }

      editMessage(nextState.SendTime, {
        MessageState: nextState.MessageState,
      });
    });
  }, [
    currentChatSecret,
    editMessage,
    removeMessage,
    send,
    subscribePush,
    userIdValue,
  ]);

  // Replys
  const [replyTo, setReplyTo] = useState<number | undefined>(undefined);

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          getMessages,
          getChatSecret,
          liveMessages: () => liveMessagesState,
          addLiveMessage,
          editMessage,
          deleteMessage,
          addReaction,
          removeReaction,
          clearLiveMessages,
          chatSecret: currentChatSecret,
          userId: userIdValue,
          inputBoxRef,
          error,
          errorDescription,
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
  getChatSecret: (userId: number) => Promise<Uint8Array | null>;
  liveMessages: () => LiveMessage[];
  addLiveMessage: (message: RawMessage) => {
    setFailed: (failed: boolean) => void;
  };
  editMessage: (sendTime: number, edit: MessageEdit) => void;
  deleteMessage: (sendTime: number) => void;
  addReaction: (sendTime: number, reaction: string) => Promise<void>;
  removeReaction: (sendTime: number, reaction: string) => Promise<void>;
  clearLiveMessages: () => void;
  chatSecret: Uint8Array | null;
  userId: number;
  inputBoxRef: React.RefObject<HTMLDivElement | null>;
  error: string;
  errorDescription: string;
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
  const { replyTo, setReplyTo, getChatSecret, userId } = useChat();
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
  }, [replyTo, ownId, userId, send, getChatSecret, handleReplyError]);

  return {
    ownId,
    replyTo,
    replyMessage,
    replyUserId: replyMessage?.SenderId,
  };
}
