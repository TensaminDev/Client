import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChat } from "./context";

import InputComponent from "./components/input";
import Message from "./components/message";

import { PAGE_SIZE } from "./values";

/**
 * Renders the chat screen with virtualized history and live message updates.
 * @returns Chat screen JSX.
 */
export default function Screen() {
  const { getMessages, liveMessages, clearLiveMessages, userId } = useChat();

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const [hasScrolledToBottomInitially, setHasScrolledToBottomInitially] =
    React.useState(false);
  const [lastLiveMessageCount, setLastLiveMessageCount] = React.useState(0);
  const [prependAnchor, setPrependAnchor] = React.useState<{
    totalSize: number;
    scrollTop: number;
  } | null>(null);

  const chatUserId = userId();
  const hasValidChatUser = Number.isSafeInteger(chatUserId) && chatUserId > 0;

  const messagesQuery = useInfiniteQuery({
    queryKey: ["chat-messages", String(chatUserId)],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getMessages(PAGE_SIZE, Number(pageParam)),
    enabled: hasValidChatUser,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) {
        return undefined;
      }

      return allPages.length * PAGE_SIZE;
    },
  });

  const historicalMessages = React.useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages].reverse().flat();
  }, [messagesQuery.data]);

  React.useEffect(() => {
    clearLiveMessages();
    setHasScrolledToBottomInitially(false);
    setLastLiveMessageCount(0);
    setPrependAnchor(null);
  }, [chatUserId, clearLiveMessages]);

  const messages = React.useMemo(
    () => [...historicalMessages, ...liveMessages()],
    [historicalMessages, liveMessages],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => messages[index].height,
    overscan: 6,
  });

  /**
   * Loads the next page when the scroll container reaches the top.
   * @returns Promise that resolves once pagination handling completes.
   */
  const onScroll = React.useCallback(async () => {
    if (!scrollRef.current) {
      return;
    }

    if (scrollRef.current.scrollTop > 96) {
      return;
    }

    if (messagesQuery.isFetchingNextPage || !messagesQuery.hasNextPage) {
      return;
    }

    setPrependAnchor({
      totalSize: virtualizer.getTotalSize(),
      scrollTop: scrollRef.current.scrollTop,
    });

    await messagesQuery.fetchNextPage();
  }, [messagesQuery, virtualizer]);

  React.useEffect(() => {
    if (
      !scrollRef.current ||
      hasScrolledToBottomInitially ||
      messages.length === 0
    ) {
      return;
    }

    queueMicrotask(() => {
      if (!scrollRef.current) {
        return;
      }

      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setHasScrolledToBottomInitially(true);
    });
  }, [hasScrolledToBottomInitially, messages]);

  React.useEffect(() => {
    const count = liveMessages().length;

    if (!scrollRef.current) {
      return;
    }

    if (count > lastLiveMessageCount) {
      queueMicrotask(() => {
        if (!scrollRef.current) {
          return;
        }

        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }

    setLastLiveMessageCount(count);
  }, [lastLiveMessageCount, liveMessages]);

  React.useEffect(() => {
    if (
      !scrollRef.current ||
      !prependAnchor ||
      messagesQuery.isFetchingNextPage
    ) {
      return;
    }

    queueMicrotask(() => {
      if (!scrollRef.current) {
        return;
      }

      const delta = virtualizer.getTotalSize() - prependAnchor.totalSize;
      scrollRef.current.scrollTop = prependAnchor.scrollTop + delta;
      setPrependAnchor(null);
    });
  }, [messagesQuery.isFetchingNextPage, prependAnchor, virtualizer]);

  /**
   * Triggers asynchronous scroll pagination without returning a promise to JSX.
   * @returns Void.
   */
  const handleContainerScroll = React.useCallback((): void => {
    void onScroll();
  }, [onScroll]);

  if (!hasValidChatUser) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xl text-foreground/80">
        Invalid user
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden px-2">
      <div
        ref={scrollRef}
        id="chat_container"
        className="flex-1 max-h-[calc(100vh-151px)] overflow-y-auto px-2.5"
        onScroll={handleContainerScroll}
      >
        <div
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            if (!message) {
              return null;
            }

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  padding: "4px 0",
                }}
              >
                <Message
                  message={message}
                  notEncrypted={message.not_encrypted}
                />
              </div>
            );
          })}
        </div>
      </div>
      <InputComponent />
    </div>
  );
}
