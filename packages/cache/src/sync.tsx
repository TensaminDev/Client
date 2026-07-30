import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCache,
  type CachedMessage,
  type UserProfile,
} from "@tensamin/cache";
import { useMTP, type MTPExchange, type ProtocolMessage } from "@tensamin/mtp";
import { useStorage } from "@tensamin/storage/context";
import { secureValueCodec } from "@tensamin/storage/secure";

function isError(message: ProtocolMessage) {
  return message.type.startsWith("Error");
}

export default function CacheSync() {
  const { addInterceptor, contextReady, freshContacts, subscribePush } =
    useMTP();
  const { load } = useStorage();
  const [accountId, setAccountId] = useState(0);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    void load("user_id").then(setAccountId);
  }, [load]);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const next = queueRef.current.then(operation);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const secureCache = useCallback(
    () =>
      createCache(String(accountId), {
        codec: secureValueCodec,
      }),
    [accountId],
  );

  const replaceMessage = useCallback(
    async (
      partnerId: number,
      sendTime: number,
      edit: Partial<CachedMessage>,
    ) => {
      const cache = secureCache();
      const window = await cache.conversations.get(partnerId);
      if (!window) return;
      await cache.conversations.replace({
        ...window,
        Messages: window.Messages.map((message) =>
          message.SendTime === sendTime ? { ...message, ...edit } : message,
        ),
      });
    },
    [secureCache],
  );

  const insertMessage = useCallback(
    async (partnerId: number, message: CachedMessage) => {
      const cache = secureCache();
      const window = await cache.conversations.get(partnerId);
      await cache.conversations.replace({
        UserId: partnerId,
        LastMessageAt: Math.max(window?.LastMessageAt ?? 0, message.SendTime),
        Messages: [
          ...(window?.Messages ?? []).filter(
            (cached) => cached.SendTime !== message.SendTime,
          ),
          message,
        ],
      });
    },
    [secureCache],
  );

  const removeMessage = useCallback(
    async (partnerId: number, sendTime: number) => {
      const cache = secureCache();
      const window = await cache.conversations.get(partnerId);
      if (!window) return;
      await cache.conversations.replace({
        ...window,
        Messages: window.Messages.filter(
          (message) => message.SendTime !== sendTime,
        ),
      });
    },
    [secureCache],
  );

  useEffect(() => {
    if (!accountId || !contextReady) return;
    void enqueue(async () => {
      const cache = secureCache();
      await cache.contacts.replace(freshContacts);
      await cache.conversations.replaceSelected(
        freshContacts.map((contact) => ({
          UserId: contact.UserId,
          LastMessageAt: contact.LastMessageAt,
          Messages: contact.Messages,
        })),
      );
    });
  }, [accountId, contextReady, enqueue, freshContacts, secureCache]);

  const synchronizeExchange = useCallback(
    async ({ type, data, response }: MTPExchange) => {
      if (!accountId || isError(response)) return;
      const request = (data ?? {}) as Record<string, unknown>;
      const result = response.data as Record<string, unknown>;

      if (type === "GetUserData") {
        await createCache(String(accountId)).profiles.put(
          result as unknown as UserProfile,
        );
        return;
      }

      if (type === "MessagesGet" && Number(request.Offset) === 0) {
        const partnerId = Number(request.UserId);
        const messages = result.Messages as CachedMessage[];
        const cache = secureCache();
        const previous = await cache.conversations.get(partnerId);
        await cache.conversations.replace({
          UserId: partnerId,
          LastMessageAt: Math.max(
            previous?.LastMessageAt ?? 0,
            ...messages.map((message) => message.SendTime),
          ),
          // This replacement is authoritative: absent server messages are deleted.
          Messages: messages,
        });
        return;
      }

      if (type === "MessageSend") {
        const partnerId = Number(request.ReceiverId);
        await insertMessage(partnerId, {
          Content: String(request.Content),
          Files: request.Files as CachedMessage["Files"],
          MessageState: "sent",
          SenderId: accountId,
          SendTime: Number(request.SendTime),
        });
        return;
      }

      if (type === "MessageEdit") {
        await replaceMessage(
          Number(request.ChatPartnerId),
          Number(request.SendTime),
          { Content: String(request.Content), Edited: true },
        );
        return;
      }

      if (type === "MessageDelete") {
        await removeMessage(
          Number(request.ChatPartnerId),
          Number(request.SendTime),
        );
        return;
      }

      if (type === "MessageReactionAdd" || type === "MessageReactionRemove") {
        const partnerId = Number(request.ChatPartnerId);
        const sendTime = Number(request.SendTime);
        const reaction = String(request.Reaction);
        const cache = secureCache();
        const window = await cache.conversations.get(partnerId);
        const message = window?.Messages.find(
          (candidate) => candidate.SendTime === sendTime,
        );
        if (!message) return;
        const reactions = (message.Reactions ?? []).filter(
          (candidate) =>
            candidate.SenderId !== accountId || candidate.Reaction !== reaction,
        );
        if (type === "MessageReactionAdd") {
          reactions.push({ SenderId: accountId, Reaction: reaction });
        }
        await replaceMessage(partnerId, sendTime, { Reactions: reactions });
        return;
      }

      if (type === "MessageState") {
        await replaceMessage(
          Number(result.ChatPartnerId),
          Number(result.SendTime),
          {
            MessageState: result.MessageState as CachedMessage["MessageState"],
          },
        );
        return;
      }
    },
    [accountId, insertMessage, removeMessage, replaceMessage, secureCache],
  );

  useEffect(() => {
    if (!accountId) return;
    return addInterceptor((exchange) =>
      enqueue(() => synchronizeExchange(exchange)),
    );
  }, [accountId, addInterceptor, enqueue, synchronizeExchange]);

  const synchronizePush = useCallback(
    async (message: ProtocolMessage) => {
      if (!accountId || isError(message)) return;
      const data = message.data as Record<string, unknown>;
      if (message.type === "MessageLive") {
        await insertMessage(
          Number(data.SenderId),
          data.Message as CachedMessage,
        );
        return;
      }
      if (message.type === "MessageEditLive") {
        await replaceMessage(
          Number(data.ChatPartnerId),
          Number(data.SendTime),
          { Content: String(data.Content), Edited: true },
        );
        return;
      }
      if (message.type === "MessageDeleteLive") {
        const deleteData = message.data as {
          ChatPartnerId: number;
          SendTime: number;
        };
        await removeMessage(deleteData.ChatPartnerId, deleteData.SendTime);
        return;
      }
      if (message.type === "MessageState") {
        await replaceMessage(
          Number(data.ChatPartnerId),
          Number(data.SendTime),
          { MessageState: data.MessageState as CachedMessage["MessageState"] },
        );
        return;
      }
      if (message.type === "MessageReactionLive") {
        const partnerId = Number(data.ChatPartnerId);
        const sendTime = Number(data.SendTime);
        const senderId = Number(data.SenderId);
        const reaction = String(data.Reaction);
        const cache = secureCache();
        const window = await cache.conversations.get(partnerId);
        const target = window?.Messages.find(
          (candidate) => candidate.SendTime === sendTime,
        );
        if (!window || !target) return;

        const reactions = (target.Reactions ?? []).filter(
          (candidate) =>
            candidate.SenderId !== senderId || candidate.Reaction !== reaction,
        );
        if (data.Accepted === true) {
          reactions.push({ SenderId: senderId, Reaction: reaction });
        }
        await replaceMessage(partnerId, sendTime, { Reactions: reactions });
      }
    },
    [accountId, insertMessage, removeMessage, replaceMessage, secureCache],
  );

  useEffect(() => {
    if (!accountId || !contextReady) return;
    return subscribePush((message) => {
      void enqueue(() => synchronizePush(message));
    });
  }, [accountId, contextReady, enqueue, subscribePush, synchronizePush]);

  return null;
}
