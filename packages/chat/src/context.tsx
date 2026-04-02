import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { LiveMessage, RawMessage, RawMessages } from "./values";
import { useCrypto } from "@tensamin/crypto/context";
import { useUser } from "@tensamin/user/context";
import { useStorage } from "@tensamin/storage/context";
import { useSocket } from "@tensamin/ttp/context";

export const context = React.createContext<contextType | undefined>(undefined);

const queryClient = new QueryClient();

/**
 * Executes Provider.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Provider(props: { children: React.ReactNode }) {
  const { getSharedSecret } = useCrypto();
  const { get } = useUser();
  const { load } = useStorage();
  const { send } = useSocket();

  const [liveMessagesState, setLiveMessagesState] = React.useState<
    LiveMessage[]
  >([]);
  const [currentSharedSecret, setCurrentSharedSecret] = React.useState("");

  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });

  const userIdValue = React.useMemo(() => {
    const rawId = (locationSearch as unknown as { id?: unknown })?.id;
    return Number(rawId ?? 0);
  }, [locationSearch]);

  React.useEffect(() => {
    const recipientId = userIdValue;

    if (!recipientId) {
      setCurrentSharedSecret("");
      return;
    }

    let active = true;

    void (async () => {
      try {
        const recipientData = await get(recipientId);
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

  const customGetMessages = React.useCallback(
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
      return sorted;
    },
    [send, userIdValue],
  );

  const addLiveMessage = React.useCallback((message: RawMessage) => {
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

  const clearLiveMessages = React.useCallback(() => {
    setLiveMessagesState([]);
  }, []);

  const value = React.useMemo<contextType>(
    () => ({
      getMessages: customGetMessages,
      liveMessages: () => liveMessagesState,
      addLiveMessage,
      clearLiveMessages,
      sharedSecret: () => currentSharedSecret,
      userId: () => userIdValue,
    }),
    [
      addLiveMessage,
      clearLiveMessages,
      currentSharedSecret,
      customGetMessages,
      liveMessagesState,
      userIdValue,
    ],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <context.Provider value={value}>{props.children}</context.Provider>
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
  sharedSecret: () => string;
  userId: () => number;
};

/**
 * Executes useChat.
 * @param none This function has no parameters.
 * @returns contextType.
 */
export function useChat(): contextType {
  const ctx = React.useContext(context);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
