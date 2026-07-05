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

export default function Provider({ children }: { children: ReactNode }) {
  const { load } = useStorage();
  const { send, subscribePush, subscribeEncrypted, decryptEncryptedRecord } =
    useMTP();
  const { moveUserIdToTop } = useSession();

  const [error] = useState("");
  const [errorDescription] = useState("");

  const [liveMessagesState, setLiveMessagesState] = useState<LiveMessage[]>([]);

  const inputBoxRef = useRef<HTMLDivElement>(null);

  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });

  // User ID compare to clear shared secret
  const userIdValue = useMemo(() => {
    const rawId = (locationSearch as unknown as { id?: unknown })?.id;
    return Number(rawId ?? 0);
  }, [locationSearch]);

  const getMessages = useCallback(
    async (amount: number, offset: number) => {
      const response = await send("EncryptedMessagesGet", {
        Limit: amount,
        SenderUserId: String(userIdValue),
      });

      if (response.type.startsWith("error")) {
        throw new Error(response.type);
      }

      const encryptedMessages = (response.data.Messages ?? []) as Record<
        string,
        unknown
      >[];
      const decrypted = await Promise.all(
        encryptedMessages.slice(offset, offset + amount).map(async (record) => {
          const inner = await decryptEncryptedRecord(record);
          const data = inner.data as Record<string, unknown>;
          return {
            NotEncrypted: false,
            SendTime: Number(
              data.SendTime ?? record.CreatedAt ?? record.createdAt,
            ),
            Content: String(data.Content ?? ""),
            SentBySelf:
              String(record.SenderUserId ?? record.senderUserId ?? "") ===
              String(await load("user_id")),
            MessageState: "received" as RawMessage["MessageState"],
          };
        }),
      );

      const sorted = [...decrypted].sort((a, b) => a.SendTime - b.SendTime);

      if (sorted.length > 0) {
        const fetchedSendTimes = new Set(sorted.map((item) => item.SendTime));

        setLiveMessagesState((prev) => {
          const filtered = prev.filter(
            (liveMessage) => !fetchedSendTimes.has(liveMessage.SendTime),
          );

          return filtered.length === prev.length ? prev : filtered;
        });
      }

      return sorted;
    },
    [send, userIdValue, decryptEncryptedRecord, load],
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

  useEffect(() => {
    return subscribeEncrypted("MessageSend", (data) => {
      const rawData = data as unknown as {
        Content?: unknown;
        ReceiverId?: unknown;
        SendTime?: unknown;
      };
      const sendTime = Number(rawData.SendTime);

      if (!Number.isFinite(sendTime) || typeof rawData.Content !== "string") {
        log(3, "chat", "yellow", "Ignoring invalid encrypted live message");
        return;
      }

      addLiveMessage({
        NotEncrypted: false,
        SendTime: sendTime,
        Content: rawData.Content,
        SentBySelf: false,
        MessageState: "received",
      });
    });
  }, [addLiveMessage, subscribeEncrypted]);

  // Get live updates for message states
  useEffect(() => {
    return subscribePush((message) => {
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
  }, [subscribePush, userIdValue]);

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider
        value={{
          getMessages,
          liveMessages: () => liveMessagesState,
          addLiveMessage,
          clearLiveMessages,
          sharedSecret: "",
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
  sharedSecret: string;
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
