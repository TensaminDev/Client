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
import { useCrypto } from "@tensamin/crypto/context";
import { useUser } from "@tensamin/user/context";
import { useStorage } from "@tensamin/storage/context";
import { useMTP } from "@tensamin/mtp";
import { log } from "@tensamin/shared/log";
import { useSession } from "@tensamin/storage/session";

export const context = createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();

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

/**
 * Executes Provider.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Provider(props: { children: ReactNode }) {
  const { getSharedSecret, decryptText } = useCrypto();
  const { get } = useUser();
  const { load } = useStorage();
  const { send, subscribePush } = useMTP();
  const { moveUserIdToTop } = useSession();

  const [liveMessagesState, setLiveMessagesState] = useState<LiveMessage[]>([]);
  const [currentSharedSecretState, setCurrentSharedSecretState] = useState<{
    userId: number;
    value: string;
  }>({
    userId: 0,
    value: "",
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

  const currentSharedSecret = useMemo(() => {
    if (currentSharedSecretState.userId !== userIdValue) {
      return "";
    }

    return currentSharedSecretState.value;
  }, [currentSharedSecretState, userIdValue]);

  // Load shared secret
  useEffect(() => {
    if (!userIdValue) return;

    let active = true;

    void (async () => {
      try {
        const recipientData = await get(userIdValue);
        const ownId = await load("user_id");
        const privateKey = await load("private_key");
        const ownData = await get(ownId);
        const sharedSecret = await getSharedSecret(
          privateKey,
          ownData.PublicKey,
          recipientData.PublicKey,
        );

        if (active) {
          setCurrentSharedSecretState({
            userId: userIdValue,
            value: sharedSecret,
          });
        }
      } catch {
        if (active) {
          setCurrentSharedSecretState({
            userId: userIdValue,
            value: "",
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [get, getSharedSecret, load, userIdValue]);

  const getMessages = useCallback(
    async (amount: number, offset: number) => {
      const messages = await send("messages_get", {
        amount,
        offset,
        UserId: userIdValue,
      });

      if (messages.type.startsWith("error")) {
        throw new Error(messages.type);
      }

      const rawMessages = messages.data.messages;
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
              content: await decryptText(currentSharedSecret, message.content),
            };
          } catch {
            return message;
          }
        }),
      );
    },
    [send, userIdValue, currentSharedSecret, decryptText],
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
      if (message.type !== "message_state") {
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
        currentSharedSecret.length > 0,
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
  }, [currentSharedSecret, subscribePush, userIdValue]);

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          getMessages,
          liveMessages: () => liveMessagesState,
          addLiveMessage,
          clearLiveMessages,
          sharedSecret: currentSharedSecret,
          userId: userIdValue,
          inputBoxRef,
        }}
      >
        {props.children}
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
  sharedSecret: string;
  userId: number;
  inputBoxRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * Executes useChat.
 * @param none This function has no parameters.
 * @returns contextType.
 */
export function useChat(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
