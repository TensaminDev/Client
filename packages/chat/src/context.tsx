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
import { log } from "@tensamin/shared/log";
import { useSession } from "@tensamin/storage/session";
import { useUser } from "@tensamin/user/context";

export const context = createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();
const CHAT_SECRET_VERSION = 1;

function bytesFromProtocol(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === "string") {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error("expected protocol bytes");
}

function updateMessageStateBySendTime<
  T extends { SendTime: number; MessageState: RawMessage["MessageState"] },
>(
  messages: T[],
  sendTime: number,
  messageState: RawMessage["MessageState"],
): { next: T[]; updated: boolean } {
  let updated = false;

  const next = messages.map((item) => {
    if (item.SendTime !== sendTime || item.MessageState === messageState) {
      return item;
    }

    updated = true;
    return {
      ...item,
      MessageState: messageState,
    };
  });

  return {
    next,
    updated,
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

        const rawSecret = randomChatSecret();
        const ownWrapped = await wrapChatSecret({
          chatSecret: rawSecret,
          recipientKemPublicKey: ownKemPublicKeyFromKeyring(keyring),
          chatId,
          secretId,
          version: CHAT_SECRET_VERSION,
        });

        await send("SetChatSecret", {
          UserId: String(ownUserId),
          ChatId: chatId,
          SecretId: secretId,
          VersionNumber: CHAT_SECRET_VERSION,
          EncryptedSecret: Array.from(ownWrapped.encryptedSecret),
          KemCiphertext: Array.from(ownWrapped.kemCiphertext),
          WrappingScheme: ownWrapped.wrappingScheme,
          CreatedAt: Date.now(),
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

        await send("ChatSecretForward", {
          ChatId: chatId,
          SenderUserId: String(ownUserId),
          RecipientUserId: String(userIdValue),
          SecretId: secretId,
          VersionNumber: CHAT_SECRET_VERSION,
          EncryptedSecret: Array.from(peerWrapped.encryptedSecret),
          KemCiphertext: Array.from(peerWrapped.kemCiphertext),
          WrappingScheme: peerWrapped.wrappingScheme,
          CreatedAt: Date.now(),
        });

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

      return await Promise.all(
        sorted.map(async (message) => {
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
    [currentChatSecret, send, userIdValue],
  );

  const addLiveMessage = useCallback(
    (message: RawMessage) => {
      const localId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (!message.SentBySelf) {
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
          setLiveMessagesState((prev) =>
            prev.map((liveMessage) =>
              liveMessage.localId === localId
                ? { ...liveMessage, failed }
                : liveMessage,
            ),
          );
        },
      };
    },
    [userIdValue, moveUserIdToTop],
  );

  const clearLiveMessages = useCallback(() => {
    setLiveMessagesState([]);
  }, []);

  // Get live updates for message states
  useEffect(() => {
    return subscribePush((message) => {
      if (message.type === "ChatSecretForward") {
        const data = message.data as Record<string, unknown>;
        void (async () => {
          const ownUserId = Number(await load("user_id"));
          if (String(data.RecipientUserId) !== String(ownUserId)) return;

          const keyring = await load("mtp_keyring");
          const chatId = String(data.ChatId);
          const secretId = String(data.SecretId);
          const secret = await unwrapChatSecret({
            encryptedSecret: bytesFromProtocol(data.EncryptedSecret),
            kemCiphertext: bytesFromProtocol(data.KemCiphertext),
            keyring,
            chatId,
            secretId,
            version: Number(data.VersionNumber),
            wrappingScheme: String(data.WrappingScheme),
          });
          const ownWrapped = await wrapChatSecret({
            chatSecret: secret,
            recipientKemPublicKey: ownKemPublicKeyFromKeyring(keyring),
            chatId,
            secretId,
            version: Number(data.VersionNumber),
          });

          await send("SetChatSecret", {
            UserId: String(ownUserId),
            ChatId: chatId,
            SecretId: secretId,
            VersionNumber: Number(data.VersionNumber),
            EncryptedSecret: Array.from(ownWrapped.encryptedSecret),
            KemCiphertext: Array.from(ownWrapped.kemCiphertext),
            WrappingScheme: ownWrapped.wrappingScheme,
            CreatedAt: Date.now(),
          });

          if (deriveChatId(ownUserId, userIdValue) === chatId) {
            setCurrentChatSecretState({ userId: userIdValue, value: secret });
          }
        })().catch((err) => {
          log(1, "chat", "red", "Failed to accept chat secret", err);
        });
        return;
      }

      if (message.type === "MessageLive") {
        const data = message.data as {
          Message?: RawMessage;
          SenderId?: number;
        };
        if (!data.Message || !currentChatSecret) return;

        void decryptChatText(currentChatSecret, data.Message.Content)
          .catch((err) => {
            log(1, "chat", "red", "Failed to decrypt live message", err, {
              SendTime: data.Message?.SendTime,
            });
            return null;
          })
          .then((content) => {
            if (!data.Message) return;
            addLiveMessage({
              ...data.Message,
              Content: content ?? "Failed to decrypt message",
              decryptionFailed: content === null,
              SentBySelf: false,
            });
          });
        return;
      }

      if (message.type !== "MessageState") {
        return;
      }

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

      setLiveMessagesState((prev) => {
        const { next, updated } = updateMessageStateBySendTime(
          prev,
          nextState.SendTime,
          nextState.MessageState,
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
            const nextPage = updateMessageStateBySendTime(
              page,
              nextState.SendTime,
              nextState.MessageState,
            );

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
    });
  }, [
    addLiveMessage,
    currentChatSecret,
    load,
    send,
    subscribePush,
    userIdValue,
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          getMessages,
          liveMessages: () => liveMessagesState,
          addLiveMessage,
          clearLiveMessages,
          chatSecret: currentChatSecret,
          userId: userIdValue,
          inputBoxRef,
          error,
          errorDescription,
        }}
      >
        {children}
      </context.Provider>
    </QueryClientProvider>
  );
}

type contextType = {
  getMessages: (amount: number, offset: number) => Promise<RawMessages>;
  liveMessages: () => LiveMessage[];
  addLiveMessage: (message: RawMessage) => {
    setFailed: (failed: boolean) => void;
  };
  clearLiveMessages: () => void;
  chatSecret: Uint8Array | null;
  userId: number;
  inputBoxRef: React.RefObject<HTMLDivElement | null>;
  error: string;
  errorDescription: string;
};

export function useChat(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
