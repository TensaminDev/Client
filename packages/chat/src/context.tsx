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
import { useTTP } from "@tensamin/ttp/context";
import { log } from "@tensamin/shared/log";

export const context = createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();

function updateMessageStateByTimestamp<
  T extends { timestamp: number; message_state: RawMessage["message_state"] },
>(
  messages: T[],
  timestamp: number,
  messageState: RawMessage["message_state"],
): { next: T[]; updated: boolean } {
  let updated = false;

  const next = messages.map((item) => {
    if (item.timestamp !== timestamp || item.message_state === messageState) {
      return item;
    }

    updated = true;
    return {
      ...item,
      message_state: messageState,
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
  const { getSharedSecret } = useCrypto();
  const { get } = useUser();
  const { load } = useStorage();
  const { send, subscribePush } = useTTP();

  const [liveMessagesState, setLiveMessagesState] = useState<LiveMessage[]>([]);
  const [currentSharedSecret, setCurrentSharedSecret] = useState("");

  const inputBoxRef = useRef<HTMLDivElement>(null);

  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });

  // User ID compare to clear shared secret
  const userIdValue = useMemo(() => {
    const rawId = (locationSearch as unknown as { id?: unknown })?.id;
    return Number(rawId ?? 0);
  }, [locationSearch]);

  const userIdValueFromLastRender = useRef(userIdValue);

  useEffect(() => {
    if (userIdValue === userIdValueFromLastRender.current) {
      return;
    }

    userIdValueFromLastRender.current = userIdValue;
    setCurrentSharedSecret("");
  }, [userIdValue]);

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
          ownData.public_key,
          recipientData.public_key,
        );

        if (active) {
          setCurrentSharedSecret(sharedSecret);
        }
      } catch {
        if (active) {
          setCurrentSharedSecret("");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [get, getSharedSecret, load, userIdValue]);

  const customGetMessages = useCallback(
    async (amount: number, offset: number) => {
      const messages = await send("messages_get", {
        amount,
        offset,
        user_id: userIdValue,
      });

      if (messages.type.startsWith("error")) {
        throw new Error(messages.type);
      }

      const rawMessages = messages.data.messages;
      const sorted = [...rawMessages].sort((a, b) => a.timestamp - b.timestamp);

      if (sorted.length > 0) {
        const fetchedTimestamps = new Set(sorted.map((item) => item.timestamp));

        setLiveMessagesState((prev) => {
          const filtered = prev.filter(
            (liveMessage) => !fetchedTimestamps.has(liveMessage.timestamp),
          );

          return filtered.length === prev.length ? prev : filtered;
        });
      }

      return sorted;
    },
    [send, userIdValue],
  );

  const addLiveMessage = useCallback((message: RawMessage) => {
    const localId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  }, []);

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
        chat_partner_id: unknown;
        timestamp: unknown;
        message_state: RawMessage["message_state"];
      };

      const nextState = {
        chat_partner_id: Number(rawData.chat_partner_id),
        timestamp: Number(rawData.timestamp),
        message_state: rawData.message_state,
      };

      if (
        !Number.isFinite(nextState.chat_partner_id) ||
        !Number.isFinite(nextState.timestamp)
      ) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message state update due to invalid data",
        );
        return;
      }

      if (nextState.chat_partner_id !== userIdValue) {
        log(
          3,
          "chat",
          "yellow",
          "Cancel message state update due to user ID mismatch",
          {
            expected: userIdValue,
            received: nextState.chat_partner_id,
          }
        );
        return;
      }

      setLiveMessagesState((prev) => {
        const { next, updated } = updateMessageStateByTimestamp(
          prev,
          nextState.timestamp,
          nextState.message_state,
        );
        return updated ? next : prev;
      });

      const queryKey = ["chat-messages", String(userIdValue)] as const;
      queryClient.setQueryData<InfiniteData<RawMessages>>(
        queryKey,
        (current) => {
          if (!current) {
            return current;
          }

          let updated = false;

          const pages = current.pages.map((page) => {
            const nextPage = updateMessageStateByTimestamp(
              page,
              nextState.timestamp,
              nextState.message_state,
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
          getMessages: customGetMessages,
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
