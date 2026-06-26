import * as React from "react";
import type { RawMessage } from "../values";
import Text from "@tensamin/markdown/text";
import { AlertTriangle, Check, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@tensamin/user/context";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import MessageContextMenu from "./messageContextMenu";
import Media from "./media";
import { useStorage } from "@tensamin/storage/context";
import { useTTP } from "@tensamin/ttp";

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
  const actuallyFailed = message.failed && message.message_state === "awaiting";

  // Fade-in
  const [hasFadedIn, setHasFadedIn] = useState(false);
  const opacityClass = !hasFadedIn
    ? "opacity-0"
    : actuallyFailed || message.message_state === "awaiting"
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
  const { send } = useTTP();
  const messageStateReadUpdate = useCallback(async () => {
    const readConfirmations = await load("settings.read_confirmations");

    if (readConfirmations) {
      if (!user?.user_id) return;

      await send("message_state", {
        chat_partner_id: user?.user_id,
        send_time: message.send_time,
        message_state: "read",
      });
    } else {
      await send("message_state", {
        chat_partner_id: user?.user_id,
        send_time: message.send_time,
        message_state: "received",
      });
    }
  }, [load, message.send_time, user?.user_id, send]);
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const receiveConfirmations = await load("settings.receive_confirmations");
      if (cancelled) return;

      switch (message.message_state) {
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
  }, [message.message_state, load, messageStateReadUpdate]);

  return (
    <div
      // pt-3 is to get a gap between messages
      className={`${grouped ? "" : "pt-3"} w-full flex justify-start transition-opacity duration-150 ${opacityClass}`}
    >
      <MessageContextMenu
        content={message.content}
        messageId={message.send_time}
      >
        <div
          className={cn(
            "group hover:bg-muted/50 select-text! justify-start flex gap-1 items-center w-full px-2 whitespace-pre-wrap break-all",
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
                  {new Date(message.send_time).toLocaleString([], {
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
              {message.failed && message.message_state === "awaiting" && (
                <Tooltip>
                  <TooltipContent>
                    <p>Failed to send message</p>
                  </TooltipContent>
                  <TooltipTrigger render={<AlertTriangle size={17} />} />
                </Tooltip>
              )}
              <div className="flex flex-col">
                {!grouped && (
                  <div className="flex items-center gap-1">
                    <p className="font-medium">{user.display}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(message.send_time).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div>
                      {message.message_state === "read" ? (
                        <CheckCheck size={14} color="var(--primary)" />
                      ) : message.message_state === "received" ? (
                        <CheckCheck size={14} color="var(--muted-foreground)" />
                      ) : message.message_state === "sent" ? (
                        <Check size={14} color="var(--muted-foreground)" />
                      ) : message.message_state === "sending" ? (
                        <div>IDK</div>
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
    prev.message.send_time === next.message.send_time &&
    prev.message.content === next.message.content &&
    prev.message.height === next.message.height &&
    prev.message.sent_by_self === next.message.sent_by_self &&
    prev.message.message_state === next.message.message_state &&
    prev.message.failed === next.message.failed &&
    prev.grouped === next.grouped &&
    prev.user === next.user
  );
});
