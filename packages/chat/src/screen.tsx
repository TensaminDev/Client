import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useChat } from "./context";

import InputComponent from "./components/input";
import Message from "./components/message";

import { PAGE_SIZE } from "./values";
import { useIsMobile } from "@tensamin/ui";

function getDistanceFromBottom(element: HTMLDivElement) {
  return element.scrollHeight - (element.scrollTop + element.clientHeight);
}

const FALLBACK_MESSAGE_HEIGHT = 56;

/**
 * Renders the chat screen with virtualized history and live message updates.
 * @returns Chat screen JSX.
 */
export default function Screen() {
  const {
    getMessages,
    liveMessages,
    clearLiveMessages,
    userId,
    sharedSecret,
    inputBoxRef,
  } = useChat();

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const stickyBottomThreshold = isMobile ? 220 : 140;

  const [hasScrolledToBottomInitially, setHasScrolledToBottomInitially] =
    React.useState(false);
  const [lastLiveMessageCount, setLastLiveMessageCount] = React.useState(0);
  const [prependAnchor, setPrependAnchor] = React.useState<{
    totalSize: number;
    scrollTop: number;
  } | null>(null);
  const [scrollWidth, setScrollWidth] = React.useState(0);
  const [scrollHeight, setScrollHeight] = React.useState(0);
  const [inputHeight, setInputHeight] = React.useState(0);
  const [measuredHeights, setMeasuredHeights] = React.useState<
    Record<number, number>
  >({});
  const measurementRefs = React.useRef(new Map<number, HTMLDivElement>());
  const shouldRestoreBottomOnResizeRef = React.useRef(false);
  const isAtBottomRef = React.useRef(true);
  const shouldRestoreBottomOnFocusResizeRef = React.useRef(false);

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

    const historicalSendTimes = new Set(
      historicalMessages.map((message) => message.send_time),
    );
    const liveWithoutDuplicates = liveMessagesSnapshot.filter(
      (message) => !historicalSendTimes.has(message.send_time),
    );

    return [...historicalMessages, ...liveWithoutDuplicates];
  }, [historicalMessages, liveMessagesSnapshot]);
  const shouldShowConversationStart =
    !!messagesQuery.data && !messagesQuery.hasNextPage;
  const virtualRowCount =
    messages.length + (shouldShowConversationStart ? 1 : 0);

  const messagesRef = React.useRef(messages);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const getItemKey = React.useCallback(
    (index: number) => {
      if (shouldShowConversationStart && index === 0) {
        return "conversation-start";
      }

      const messageIndex = shouldShowConversationStart ? index - 1 : index;
      return messagesRef.current[messageIndex]?.send_time ?? index;
    },
    [shouldShowConversationStart],
  );

  const setMeasurementRef = React.useCallback(
    (sendTime: number, element: HTMLDivElement | null) => {
      if (!element) {
        measurementRefs.current.delete(sendTime);
        return;
      }

      measurementRefs.current.set(sendTime, element);
    },
    [],
  );

  const estimateMessageSize = React.useCallback(
    (index: number) => {
      if (shouldShowConversationStart && index === 0) {
        return FALLBACK_MESSAGE_HEIGHT;
      }

      const messageIndex = shouldShowConversationStart ? index - 1 : index;
      const sendTime = messages[messageIndex]?.send_time;

      if (sendTime === undefined) {
        return FALLBACK_MESSAGE_HEIGHT;
      }

      return measuredHeights[sendTime] ?? FALLBACK_MESSAGE_HEIGHT;
    },
    [measuredHeights, messages, shouldShowConversationStart],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: estimateMessageSize,
    overscan: isMobile ? 10 : 6,
  });

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateDimensions = () => {
      setScrollWidth(element.clientWidth);
      setScrollHeight(element.clientHeight);
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      virtualizer.measure();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [inputHeight, measuredHeights, scrollWidth, virtualizer]);

  React.useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const measureHeights = () => {
      setMeasuredHeights((prev) => {
        let changed = false;
        const next: Record<number, number> = {};

        for (const message of messages) {
          const element = measurementRefs.current.get(message.send_time);
          const measuredHeight = element?.getBoundingClientRect().height;
          const nextHeight =
            typeof measuredHeight === "number" &&
            Number.isFinite(measuredHeight)
              ? Math.ceil(measuredHeight)
              : (prev[message.send_time] ?? FALLBACK_MESSAGE_HEIGHT);

          next[message.send_time] = nextHeight;

          if (prev[message.send_time] !== nextHeight) {
            changed = true;
          }
        }

        if (!changed && Object.keys(prev).length === messages.length) {
          return prev;
        }

        return next;
      });
    };

    measureHeights();

    const observer = new ResizeObserver(() => {
      measureHeights();
    });

    for (const message of messages) {
      const element = measurementRefs.current.get(message.send_time);
      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [messages, scrollWidth]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const restoreBottomAfterResize = () => {
      shouldRestoreBottomOnResizeRef.current =
        isAtBottomRef.current || shouldRestoreBottomOnFocusResizeRef.current;

      requestAnimationFrame(() => {
        virtualizer.measure();

        requestAnimationFrame(() => {
          if (!scrollRef.current || !shouldRestoreBottomOnResizeRef.current) {
            return;
          }

          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          isAtBottomRef.current = true;
          shouldRestoreBottomOnFocusResizeRef.current = false;
          shouldRestoreBottomOnResizeRef.current = false;
        });
      });
    };

    window.addEventListener("resize", restoreBottomAfterResize);
    window.visualViewport?.addEventListener("resize", restoreBottomAfterResize);

    return () => {
      window.removeEventListener("resize", restoreBottomAfterResize);
      window.visualViewport?.removeEventListener(
        "resize",
        restoreBottomAfterResize,
      );
    };
  }, [virtualizer]);

  React.useLayoutEffect(() => {
    const element = inputBoxRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateHeight = () => {
      setInputHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [inputBoxRef]);

  React.useEffect(() => {
    const element = inputBoxRef.current;
    if (!element) {
      return;
    }

    const handleFocusIn = () => {
      if (!scrollRef.current) {
        return;
      }

      shouldRestoreBottomOnFocusResizeRef.current =
        getDistanceFromBottom(scrollRef.current) <= stickyBottomThreshold;
    };

    const handleFocusOut = () => {
      shouldRestoreBottomOnFocusResizeRef.current = false;
    };

    element.addEventListener("focusin", handleFocusIn);
    element.addEventListener("focusout", handleFocusOut);

    return () => {
      element.removeEventListener("focusin", handleFocusIn);
      element.removeEventListener("focusout", handleFocusOut);
    };
  }, [inputBoxRef, stickyBottomThreshold]);

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
      virtualRowCount === 0
    ) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    isAtBottomRef.current = true;
    setHasScrolledToBottomInitially(true);
  }, [hasScrolledToBottomInitially, virtualRowCount]);

  React.useLayoutEffect(() => {
    const count = liveMessagesSnapshot.length;

    if (!scrollRef.current) {
      return;
    }

    if (count > lastLiveMessageCount) {
      const shouldStickToBottom =
        getDistanceFromBottom(scrollRef.current) <= stickyBottomThreshold;

      if (shouldStickToBottom) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        isAtBottomRef.current = true;
      }
    }

    setLastLiveMessageCount(count);
  }, [
    lastLiveMessageCount,
    liveMessagesSnapshot.length,
    stickyBottomThreshold,
  ]);

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
    if (scrollRef.current) {
      isAtBottomRef.current =
        getDistanceFromBottom(scrollRef.current) <= stickyBottomThreshold;
    }

    void onScroll();
  }, [onScroll, stickyBottomThreshold]);

  const [value, setValue] = React.useState("");
  const totalSize = virtualizer.getTotalSize();
  const verticalOffset = Math.max(0, scrollHeight - totalSize);
  const contentHeight = Math.max(totalSize, scrollHeight);

  // Render
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
        className="min-h-0 flex-1 overflow-y-auto px-2.5"
        style={{
          overflowAnchor: "none",
          paddingBottom: "8px",
        }}
        onScroll={handleContainerScroll}
      >
        <div
          className="relative w-full"
          style={{
            height: `${contentHeight}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            if (shouldShowConversationStart && virtualRow.index === 0) {
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
                    transform: `translateY(${virtualRow.start + verticalOffset}px)`,
                    padding: "4px 0",
                  }}
                >
                  <div className="w-full flex justify-start">
                    <div className="max-w-[80%] rounded-lg bg-muted px-2 py-px text-sm text-foreground/55 whitespace-pre-wrap break-all">
                      This is the start of your conversation with{" "}
                    </div>
                  </div>
                </div>
              );
            }

            const messageIndex = shouldShowConversationStart
              ? virtualRow.index - 1
              : virtualRow.index;
            const message = messages[messageIndex];
            if (!message) {
              return null;
            }

            return (
              <div
                key={message.send_time}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start + verticalOffset}px)`,
                  padding: "4px 0",
                }}
              >
                <Message message={message} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="z-10 shrink-0">
        <InputComponent setValue={setValue} value={value} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 overflow-hidden opacity-0"
        style={{ width: scrollWidth > 0 ? `${scrollWidth}px` : "100%" }}
      >
        {messages.map((message) => (
          <div
            key={`measure-${message.send_time}`}
            ref={(element) => {
              setMeasurementRef(message.send_time, element);
            }}
            style={{ padding: "4px 0" }}
          >
            <Message message={message} />
          </div>
        ))}
      </div>
    </div>
  );
}
