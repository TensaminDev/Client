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
  Skeleton,
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
    decryptionFailed?: boolean;
  };
  user: User | null;
}) {
  const actuallyFailed =
    (message.failed && message.MessageState === "awaiting") ||
    message.decryptionFailed;

  // Fade-in
  const [hasFadedIn, setHasFadedIn] = useState(false);
  const opacityClass = !hasFadedIn
    ? "opacity-0"
    : message.MessageState === "awaiting"
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

  // Message states
  const { load } = useStorage();
  const { send } = useMTP();
  const messageStateReadUpdate = useCallback(async () => {
    const readConfirmations = await load("settings.read_confirmations");

    if (readConfirmations) {
      if (!user?.UserId) return;

      await send("MessageState", {
        ChatPartnerId: user?.UserId,
        SendTime: message.SendTime,
        MessageState: "read",
      });
    } else {
      await send("MessageState", {
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

  // Check if message is a url
  const [isValidURL, setIsValidURL] = useState(false);
  useEffect(() => {
    try {
      if (message.Content.split(" ").length > 1) throw new Error();

      new URL(message.Content);
      setIsValidURL(true);
    } catch {
      setIsValidURL(false);
    }
  }, [message.Content]);

  return (
    <div
      // pt-3 is to get a gap between messages
      className={`${grouped ? "" : "pt-3"} w-full flex justify-start transition-opacity duration-150 ${opacityClass}`}
    >
      {user ? (
        <div
          className={cn(
            "group hover:bg-muted/50 select-text! relative justify-start flex gap-1 items-center w-full px-2 whitespace-pre-wrap break-all",
            {
              "bg-(--destructive)/10 text-destructive-foreground hover:bg-(--destructive)/15":
                actuallyFailed,
            },
          )}
        >
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
                <AvatarImage src={user.Avatar} />
                <AvatarFallback>
                  {user.Display.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
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
                  <p className="font-medium">{user.Display}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(message.SendTime).toLocaleString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="flex items-center justify-start gap-1">
                    {message.MessageState === "read" ? (
                      <Check size={12} color="var(--primary-foreground-alt)" />
                    ) : message.MessageState === "received" ? (
                      <Check size={12} color="var(--muted-foreground)" />
                    ) : message.MessageState === "sent" ? (
                      <RefreshCw size={12} color="var(--muted-foreground)" />
                    ) : message.MessageState === "sending" ? (
                      <Ellipse size={12} color="var(--muted-foreground)" />
                    ) : null}
                    {actuallyFailed && (
                      <AlertTriangle color="var(--destructive)" size={12} />
                    )}
                  </div>
                </div>
              )}

              {message.Content ? (
                <MessageContextMenu
                  content={message.Content}
                  messageId={message.SendTime}
                >
                  {isValidURL ? (
                    <Media link={message.Content} />
                  ) : (
                    <Text value={message.Content} />
                  )}
                </MessageContextMenu>
              ) : (
                <Skeleton
                  className={`w-25 h-5 ${grouped ? "my-1" : "mb-1"} rounded-sm!`}
                />
              )}
            </div>
          </>
        </div>
      ) : (
        <Skeleton className="h-10 w-30" />
      )}
    </div>
  );
}

export default React.memo(MessageComponent, (prev, next) => {
  return (
    prev.message.SendTime === next.message.SendTime &&
    prev.message.Content === next.message.Content &&
    prev.message.SentBySelf === next.message.SentBySelf &&
    prev.message.MessageState === next.message.MessageState &&
    prev.message.failed === next.message.failed &&
    prev.message.decryptionFailed === next.message.decryptionFailed &&
    prev.grouped === next.grouped &&
    prev.user === next.user
  );
});
