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
  const [inputHeight, setInputHeight] = React.useState(0);
  const [measuredHeights, setMeasuredHeights] = React.useState<
    Record<number, number>
  >({});
  const measurementRefs = React.useRef(new Map<number, HTMLDivElement>());

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

  const messagesRef = React.useRef(messages);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const getItemKey = React.useCallback((index: number) => {
    return messagesRef.current[index]?.send_time ?? index;
  }, []);

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
      const sendTime = messages[index]?.send_time;

      if (sendTime === undefined) {
        return FALLBACK_MESSAGE_HEIGHT;
      }

      return measuredHeights[sendTime] ?? FALLBACK_MESSAGE_HEIGHT;
    },
    [measuredHeights, messages],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
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

    const updateWidth = () => {
      setScrollWidth(element.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
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

    const handleResize = () => {
      requestAnimationFrame(() => {
        virtualizer.measure();
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
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
      const shouldStickToBottom =
        getDistanceFromBottom(scrollRef.current) <= stickyBottomThreshold;

      if (shouldStickToBottom) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    void onScroll();
  }, [onScroll]);

  const [value, setValue] = React.useState("");

  // Render
  if (!hasValidChatUser) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xl text-foreground/80">
        Invalid user
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden px-2">
      <div
        ref={scrollRef}
        id="chat_container"
        className="absolute inset-x-0 top-0 overflow-y-auto px-2.5"
        style={{
          bottom: `${inputHeight}px`,
          overflowAnchor: "none",
          paddingBottom: "8px",
        }}
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
                key={message.send_time}
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
                <Message message={message} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10">
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
