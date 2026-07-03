import * as React from "react";
import type { RawMessage } from "../values";
import Text from "@tensamin/markdown/text";
import {
  AlertTriangle,
  Check,
  Ellipse,
  Forward,
  Laugh,
  RefreshCw,
  Reply,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@tensamin/user/context";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  cn,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import MessageContextMenu from "./messageContextMenu";
import Media from "./media";
import { useStorage } from "@tensamin/storage/context";
import { useMTP } from "@tensamin/mtp";

function MessageComponent({
  grouped,
  message,
  user,
}: {
  grouped: boolean;
  message: RawMessage & {
    failed?: boolean;
  };
  user: User | null;
}) {
  const actuallyFailed = message.failed && message.MessageState === "awaiting";

  // Fade-in
  const [hasFadedIn, setHasFadedIn] = useState(false);
  const opacityClass = !hasFadedIn
    ? "opacity-0"
    : actuallyFailed || message.MessageState === "awaiting"
      ? "opacity-50"
      : "opacity-100";
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHasFadedIn(true);
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  // Check if message is a url
  const [isValidURL, setIsValidURL] = useState(false);
  useEffect(() => {
    try {
      if (message.content.split(" ").length > 1) throw new Error();

      new URL(message.content);
      setIsValidURL(true);
    } catch {
      setIsValidURL(false);
    }
  }, [message.content]);

  // Message states
  const { load } = useStorage();
  const { send } = useMTP();
  const messageStateReadUpdate = useCallback(async () => {
    const readConfirmations = await load("settings.read_confirmations");

    if (readConfirmations) {
      if (!user?.UserId) return;

      await send("message_state", {
        ChatPartnerId: user?.UserId,
        SendTime: message.SendTime,
        MessageState: "read",
      });
    } else {
      await send("message_state", {
        ChatPartnerId: user?.UserId,
        SendTime: message.SendTime,
        MessageState: "received",
      });
    }
  }, [load, message.SendTime, user?.UserId, send]);
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const receiveConfirmations = await load("settings.receive_confirmations");
      if (cancelled) return;

      switch (message.MessageState) {
        case "sent":
          if (receiveConfirmations) {
            messageStateReadUpdate();
          }
          break;

        case "received":
          messageStateReadUpdate();
          break;

        default:
          break;
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [message.MessageState, load, messageStateReadUpdate]);

  return (
    <div
      // pt-3 is to get a gap between messages
      className={`${grouped ? "" : "pt-3"} w-full flex justify-start transition-opacity duration-150 ${opacityClass}`}
    >
      <MessageContextMenu
        content={message.content}
        messageId={message.SendTime}
      >
        <div
          className={cn(
            "group hover:bg-muted/50 select-text! relative justify-start flex gap-1 items-center w-full px-2 whitespace-pre-wrap break-all",
            {
              "bg-(--destructive)/15 text-destructive-foreground":
                actuallyFailed,
            },
          )}
        >
          {user ? (
            <>
              {grouped ? (
                <p className="w-9 text-xs group-hover:visible invisible text-muted-foreground">
                  {new Date(message.SendTime).toLocaleString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ) : (
                <Avatar className="mr-1 mb-auto mt-1 w-10">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>
                    {user.display.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              {message.failed && message.MessageState === "awaiting" && (
                <Tooltip>
                  <TooltipContent>
                    <p>Failed to send message</p>
                  </TooltipContent>
                  <TooltipTrigger render={<AlertTriangle size={17} />} />
                </Tooltip>
              )}
              <div className="flex flex-col group">
                <Card className="absolute right-4 -top-3 opacity-0 group-hover:opacity-100 flex flex-row justify-end gap-0! z-10 p-0! shadow-lg rounded-lg!">
                  {[0, 1, 2].map((item) => (
                    <Button key={item} variant="ghost" className="h-8 w-8">
                      {item === 0 && "👍"}
                      {item === 1 && "🔥"}
                      {item === 2 && "✅"}
                    </Button>
                  ))}
                  <Separator orientation="vertical" className="my-1" />
                  <Button variant="ghost" className="h-8 w-8">
                    <Laugh />
                  </Button>
                  <Button variant="ghost" className="h-8 w-8">
                    <Reply />
                  </Button>
                  <Button variant="ghost" className="h-8 w-8">
                    <Forward />
                  </Button>
                </Card>
                {!grouped && (
                  <div className="flex items-center gap-1">
                    <p className="font-medium">{user.display}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(message.SendTime).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div>
                      {message.MessageState === "read" ? (
                        <Check
                          size={12}
                          color="var(--primary-foreground-alt)"
                        />
                      ) : message.MessageState === "received" ? (
                        <Check size={12} color="var(--muted-foreground)" />
                      ) : message.MessageState === "sent" ? (
                        <RefreshCw size={12} color="var(--muted-foreground)" />
                      ) : message.MessageState === "sending" ? (
                        <Ellipse size={12} color="var(--muted-foreground)" />
                      ) : null}
                    </div>
                  </div>
                )}
                {isValidURL ? (
                  <Media link={message.content} />
                ) : (
                  <Text value={message.content} />
                )}
              </div>
            </>
          ) : (
            "Loading"
          )}
        </div>
      </MessageContextMenu>
    </div>
  );
}

export default React.memo(MessageComponent, (prev, next) => {
  return (
    prev.message.SendTime === next.message.SendTime &&
    prev.message.content === next.message.content &&
    prev.message.height === next.message.height &&
    prev.message.SentBySelf === next.message.SentBySelf &&
    prev.message.MessageState === next.message.MessageState &&
    prev.message.failed === next.message.failed &&
    prev.grouped === next.grouped &&
    prev.user === next.user
  );
});
