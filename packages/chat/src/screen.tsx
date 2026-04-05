import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChat } from "./context";

import InputComponent from "./components/input";
import Message from "./components/message";

import { PAGE_SIZE } from "./values";
import { useLayoutEffect } from "react";

/**
 * Renders the chat screen with virtualized history and live message updates.
 * @returns Chat screen JSX.
 */
export default function Screen() {
  const { getMessages, liveMessages, clearLiveMessages, userId } = useChat();

  const inputBoxRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const [hasScrolledToBottomInitially, setHasScrolledToBottomInitially] =
    React.useState(false);
  const [lastLiveMessageCount, setLastLiveMessageCount] = React.useState(0);
  const [prependAnchor, setPrependAnchor] = React.useState<{
    totalSize: number;
    scrollTop: number;
  } | null>(null);

  const hasValidChatUser = Number.isSafeInteger(userId) && userId > 0;

  const messagesQuery = useInfiniteQuery({
    queryKey: ["chat-messages", String(userId)],
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
  }, [userId, clearLiveMessages]);

  const liveMessagesSnapshot = liveMessages();

  const messages = React.useMemo(() => {
    if (historicalMessages.length === 0) {
      return liveMessagesSnapshot;
    }

    const historicalTimestamps = new Set(
      historicalMessages.map((message) => message.timestamp),
    );
    const liveWithoutDuplicates = liveMessagesSnapshot.filter(
      (message) => !historicalTimestamps.has(message.timestamp),
    );

    return [...historicalMessages, ...liveWithoutDuplicates];
  }, [historicalMessages, liveMessagesSnapshot]);

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

  React.useLayoutEffect(() => {
    if (
      !scrollRef.current ||
      hasScrolledToBottomInitially ||
      messages.length === 0
    ) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    setHasScrolledToBottomInitially(true);
  }, [hasScrolledToBottomInitially, messages]);

  React.useLayoutEffect(() => {
    const count = liveMessagesSnapshot.length;

    if (!scrollRef.current) {
      return;
    }

    if (count > lastLiveMessageCount) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    setLastLiveMessageCount(count);
  }, [lastLiveMessageCount, liveMessagesSnapshot.length]);

  React.useLayoutEffect(() => {
    if (
      !scrollRef.current ||
      !prependAnchor ||
      messagesQuery.isFetchingNextPage
    ) {
      return;
    }

    const delta = virtualizer.getTotalSize() - prependAnchor.totalSize;
    scrollRef.current.scrollTop = prependAnchor.scrollTop + delta;
    setPrependAnchor(null);
  }, [messagesQuery.isFetchingNextPage, prependAnchor, virtualizer]);

  /**
   * Triggers asynchronous scroll pagination without returning a promise to JSX.
   * @returns Void.
   */
  const handleContainerScroll = React.useCallback((): void => {
    void onScroll();
  }, [onScroll]);

  /**
   * Input box height changes & state
   */
  const [value, setValue] = React.useState("");

  const updateMaxHeight = React.useCallback(() => {
    const el = inputBoxRef.current;
    const host = scrollRef.current;
    if (!host || !el || typeof window === "undefined") return;

    const viewportHeight = Math.max(
      window.innerHeight,
      window.visualViewport?.height ?? 0,
    );
    const inputHeight = el.scrollHeight + 50;

    host.style.maxHeight = `calc(${viewportHeight}px - ${inputHeight}px - env(safe-area-inset-bottom) - env(safe-area-inset-top))`;
  }, []);

  useLayoutEffect(() => {
    updateMaxHeight();
  }, [value, updateMaxHeight]);

  React.useEffect(() => {
    updateMaxHeight();

    if (typeof window === "undefined") {
      return;
    }

    const handleViewportChange = () => {
      updateMaxHeight();
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);

    const input = inputBoxRef.current;
    const resizeObserver = input
      ? new ResizeObserver(handleViewportChange)
      : null;
    if (input) {
      resizeObserver?.observe(input);
    }

    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      resizeObserver?.disconnect();
    };
  }, [updateMaxHeight]);

  // Render
  if (!hasValidChatUser) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xl text-foreground/80">
        Invalid user
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col px-2">
      <div
        ref={scrollRef}
        id="chat_container"
        className="flex-1 overflow-y-auto px-2.5"
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
                key={message.timestamp}
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
      <div ref={inputBoxRef}>
        <InputComponent setValue={setValue} value={value} />
      </div>
    </div>
  );
}
