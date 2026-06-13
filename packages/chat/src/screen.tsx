import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { failedUser } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import { useUser, type User } from "@tensamin/user/context";

import InputComponent from "./components/input";
import Message from "./components/message";
import { useChat } from "./context";
import {
  PAGE_SIZE,
  FALLBACK_MESSAGE_HEIGHT,
  MESSAGES_PER_VIRTUAL_ROW,
} from "./values";

function getEstimatedMessageHeight(message: { height?: number }) {
  return typeof message.height === "number" && Number.isFinite(message.height)
    ? Math.max(1, Math.ceil(message.height))
    : FALLBACK_MESSAGE_HEIGHT;
}

function shouldFetchPreviousPage({
  entry,
  hasNextPage,
  isFetchingNextPage,
  userScrolledUp,
}: {
  entry: IntersectionObserverEntry | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  userScrolledUp: boolean;
}) {
  return [
    entry?.isIntersecting === true,
    userScrolledUp,
    hasNextPage,
    !isFetchingNextPage,
  ].every(Boolean);
}

/**
 * Renders the chat screen with virtualized history and live message updates.
 * @returns Chat screen JSX.
 */
export default function Screen() {
  const { getMessages, liveMessages, clearLiveMessages, userId, sharedSecret } =
    useChat();
  const { get: getUser } = useUser();
  const { load } = useStorage();

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const topSentinelRef = React.useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = React.useRef(false);
  const userScrolledUpRef = React.useRef(false);
  const isAtBottomRef = React.useRef(true);
  const smoothScrollFrameRef = React.useRef<number | null>(null);
  const smoothScrollTargetRef = React.useRef(0);

  const [messageUsers, setMessageUsers] = React.useState<
    Record<string, User | undefined>
  >({});
  const [lastLiveMessageCount, setLastLiveMessageCount] = React.useState(0);
  const [didInitialScroll, setDidInitialScroll] = React.useState(false);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [value, setValue] = React.useState("");

  const hasValidChatUser = Number.isSafeInteger(userId) && userId > 0;
  const hasSharedSecret = sharedSecret.length > 0;

  const messagesQuery = useInfiniteQuery({
    queryKey: ["chat-messages", String(userId), hasSharedSecret],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getMessages(PAGE_SIZE, Number(pageParam)),
    enabled: hasValidChatUser && hasSharedSecret,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) {
        return undefined;
      }

      return allPages.length * PAGE_SIZE;
    },
  });

  React.useEffect(() => {
    clearLiveMessages();
    didInitialScrollRef.current = false;
    userScrolledUpRef.current = false;
    isAtBottomRef.current = true;
    setDidInitialScroll(false);
    setLastLiveMessageCount(0);
  }, [clearLiveMessages, userId]);

  React.useEffect(() => {
    if (!hasValidChatUser) {
      setMessageUsers({});
      return;
    }

    let active = true;

    const loadMessageUser = async (
      key: string,
      resolveUserId: () => Promise<number>,
    ) => {
      try {
        const resolvedUserId = await resolveUserId();
        const value = await getUser(resolvedUserId);

        if (active) {
          setMessageUsers((prev) => ({ ...prev, [key]: value }));
        }
      } catch {
        if (active) {
          setMessageUsers((prev) => ({ ...prev, [key]: failedUser }));
        }
      }
    };

    setMessageUsers({});
    void loadMessageUser("peer", async () => userId);
    void loadMessageUser("own", async () => Number(await load("user_id")));

    return () => {
      active = false;
    };
  }, [getUser, hasValidChatUser, load, userId]);

  const historicalMessages = React.useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return [...pages].reverse().flat();
  }, [messagesQuery.data]);

  const liveMessagesSnapshot = liveMessages();

  const messages = React.useMemo(() => {
    if (historicalMessages.length === 0) {
      return liveMessagesSnapshot;
    }

    const historicalSendTimes = new Set(
      historicalMessages.map((message) => message.send_time),
    );
    const liveWithoutDuplicates = liveMessagesSnapshot.filter(
      (message) => !historicalSendTimes.has(message.send_time),
    );

    return [...historicalMessages, ...liveWithoutDuplicates];
  }, [historicalMessages, liveMessagesSnapshot]);

  const messageChunks = React.useMemo(() => {
    const chunks: Array<{
      key: number;
      messages: typeof messages;
      startIndex: number;
    }> = [];

    for (let end = messages.length; end > 0; end -= MESSAGES_PER_VIRTUAL_ROW) {
      const start = Math.max(0, end - MESSAGES_PER_VIRTUAL_ROW);
      const chunkMessages = messages.slice(start, end);
      const firstMessage = chunkMessages[0];

      if (firstMessage) {
        chunks.push({
          key: firstMessage.send_time,
          messages: chunkMessages,
          startIndex: start,
        });
      }
    }

    return chunks;
  }, [messages]);

  const shouldShowConversationStart =
    !!messagesQuery.data && !messagesQuery.hasNextPage;
  const virtualRowCount =
    messageChunks.length + (shouldShowConversationStart ? 1 : 0);

  const getItemKey = React.useCallback(
    (index: number) => {
      if (shouldShowConversationStart && index === messageChunks.length) {
        return "conversation-start";
      }

      return messageChunks[index]?.key ?? index;
    },
    [messageChunks, shouldShowConversationStart],
  );

  const estimateSize = React.useCallback(
    (index: number) => {
      const isConversationStart =
        shouldShowConversationStart && index === messageChunks.length;
      if (isConversationStart) {
        return FALLBACK_MESSAGE_HEIGHT;
      }

      const chunk = messageChunks[index];

      if (!chunk) {
        return FALLBACK_MESSAGE_HEIGHT;
      }

      return chunk.messages.reduce(
        (total, message) => total + getEstimatedMessageHeight(message),
        0,
      );
    },
    [messageChunks, shouldShowConversationStart],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize,
    overscan: 2,
  });
  const totalSize = virtualizer.getTotalSize();
  const contentHeight = Math.max(totalSize, viewportHeight);
  const verticalOffset = Math.max(0, viewportHeight - totalSize);

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewportHeight();

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useLayoutEffect(() => {
    if (didInitialScrollRef.current || virtualRowCount === 0) {
      return;
    }

    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }

      requestAnimationFrame(() => {
        didInitialScrollRef.current = true;
        setDidInitialScroll(true);
      });
    });
  }, [virtualizer, virtualRowCount]);

  React.useLayoutEffect(() => {
    const count = liveMessagesSnapshot.length;

    if (count > lastLiveMessageCount && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      });
    }

    setLastLiveMessageCount(count);
  }, [
    lastLiveMessageCount,
    liveMessagesSnapshot.length,
    virtualRowCount,
    virtualizer,
  ]);

  React.useEffect(() => {
    if (
      viewportHeight === 0 ||
      totalSize > viewportHeight ||
      messagesQuery.isFetchingNextPage ||
      !messagesQuery.hasNextPage
    ) {
      return;
    }

    void messagesQuery.fetchNextPage();
  }, [didInitialScroll, messagesQuery, totalSize, viewportHeight]);

  React.useLayoutEffect(() => {
    if (
      !didInitialScroll ||
      userScrolledUpRef.current ||
      virtualRowCount === 0
    ) {
      return;
    }

    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    });
  }, [didInitialScroll, virtualRowCount]);

  React.useEffect(() => {
    const root = scrollRef.current;
    const sentinel = topSentinelRef.current;

    if (!root || !sentinel || !didInitialScroll) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          shouldFetchPreviousPage({
            entry,
            hasNextPage: messagesQuery.hasNextPage,
            isFetchingNextPage: messagesQuery.isFetchingNextPage,
            userScrolledUp: userScrolledUpRef.current,
          })
        ) {
          void messagesQuery.fetchNextPage();
        }
      },
      { root, rootMargin: "240px 0px 0px 0px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [didInitialScroll, messagesQuery, virtualRowCount]);

  const handleContainerScroll = React.useCallback(() => {
    if (!scrollRef.current) {
      return;
    }

    isAtBottomRef.current = scrollRef.current.scrollTop <= 140;

    if (didInitialScrollRef.current && scrollRef.current.scrollTop > 140) {
      userScrolledUpRef.current = true;
    }
  }, []);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    smoothScrollTargetRef.current = element.scrollTop;

    const animateScroll = () => {
      const distance = smoothScrollTargetRef.current - element.scrollTop;
      if (Math.abs(distance) < 0.5) {
        element.scrollTop = smoothScrollTargetRef.current;
        smoothScrollFrameRef.current = null;
        handleContainerScroll();
        return;
      }

      element.scrollTop += distance * 0.35;
      handleContainerScroll();
      smoothScrollFrameRef.current = requestAnimationFrame(animateScroll);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (smoothScrollFrameRef.current === null) {
        smoothScrollTargetRef.current = element.scrollTop;
      }

      const maxScrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight,
      );
      smoothScrollTargetRef.current = Math.min(
        Math.max(0, smoothScrollTargetRef.current - event.deltaY),
        maxScrollTop,
      );

      if (smoothScrollFrameRef.current === null) {
        smoothScrollFrameRef.current = requestAnimationFrame(animateScroll);
      }
    };

    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleWheel);
      if (smoothScrollFrameRef.current !== null) {
        cancelAnimationFrame(smoothScrollFrameRef.current);
        smoothScrollFrameRef.current = null;
      }
    };
  }, [handleContainerScroll]);

  if (!hasValidChatUser) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xl text-foreground/80">
        Invalid user
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        ref={scrollRef}
        id="chat_container"
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          overflowAnchor: "none",
          paddingTop: "22px",
          transform: "scaleY(-1)",
        }}
        onScroll={handleContainerScroll}
      >
        <div
          className="relative w-full"
          style={{ height: `${contentHeight}px` }}
        >
          <div
            ref={topSentinelRef}
            className="absolute bottom-0 left-0 h-px w-full"
          />
          {virtualizer.getVirtualItems().map((virtualRow) => {
            if (
              shouldShowConversationStart &&
              virtualRow.index === messageChunks.length
            ) {
              return (
                <div
                  key="conversation-start"
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${verticalOffset + virtualRow.start}px)`,
                  }}
                >
                  <div className="w-full flex justify-start scale-y-[-1]">
                    <div className="text-sm text-foreground/55 px-2.5">
                      Conversation start
                    </div>
                  </div>
                </div>
              );
            }

            const chunkIndex = virtualRow.index;
            const chunk = messageChunks[chunkIndex];
            if (!chunk) {
              return null;
            }

            return (
              <div
                key={chunk.key}
                data-index={virtualRow.index}
                className="flex flex-col"
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${verticalOffset + virtualRow.start}px)`,
                }}
              >
                <div className="flex flex-col scale-y-[-1]">
                  {chunk.messages.map((message, chunkMessageIndex) => {
                    const messageIndex = chunk.startIndex + chunkMessageIndex;
                    const lastMessage = messages[messageIndex - 1];
                    const isGrouped =
                      lastMessage &&
                      lastMessage.sent_by_self === message.sent_by_self &&
                      Math.round(lastMessage.send_time / 10000) ===
                        Math.round(message.send_time / 10000);

                    return (
                      <Message
                        key={message.send_time}
                        grouped={isGrouped}
                        message={message}
                        user={
                          message.sent_by_self
                            ? (messageUsers.own ?? null)
                            : (messageUsers.peer ?? null)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="z-10 shrink-0">
        <InputComponent setValue={setValue} value={value} />
      </div>
    </div>
  );
}
