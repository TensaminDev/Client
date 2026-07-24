import type { RawMessage } from "../values";
import Text from "@tensamin/markdown/text";
import { AlertTriangle, Check, Ellipse, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import type { User } from "@tensamin/user/context";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  Skeleton,
} from "@tensamin/ui";
import MessageContextMenu from "./messageContextMenu";
import Media from "./media";
import { useStorage } from "@tensamin/storage/context";
import { useMTP } from "@tensamin/mtp";
import Input from "@tensamin/markdown/input";
import { useChat } from "../context";
import { encryptChatText } from "@tensamin/crypto/chatSecret";
import { log, toast } from "@tensamin/shared/log";
import Emoji, { normalizeShortcode } from "@tensamin/markdown/emoji";
import { useRecordEmojiUse } from "./emojiRanks";

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
  const [ownId, setOwnId] = useState(0);
  useEffect(() => {
    load("user_id").then(setOwnId);
  }, [load]);
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
    if (message.SenderId === ownId || ownId === 0) return;

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
  }, [
    message.MessageState,
    load,
    messageStateReadUpdate,
    message.SenderId,
    ownId,
  ]);

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

  // Message editing
  const {
    addReaction,
    chatSecret,
    editMessage,
    userId,
    deleteMessage,
    removeReaction,
  } = useChat();
  const recordUse = useRecordEmojiUse();
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.Content);
  useEffect(() => {
    if (!editing) {
      setEditDraft(message.Content);
    }
  }, [editing, message.Content]);
  const submitEditMessage = useCallback(
    async (newContent: string) => {
      if (!chatSecret) return;

      const encryptedContent = await encryptChatText(
        chatSecret,
        newContent,
      ).catch((err) => {
        toast("error", "Failed to encrypt edit", String(err));
      });

      if (!encryptedContent) return;

      const previousContent = message.Content;
      editMessage(message.SendTime, { Content: newContent, Edited: true });

      try {
        const response = await send("MessageEdit", {
          ChatPartnerId: userId,
          Content: encryptedContent,
          SendTime: message.SendTime,
        });

        if (response.type.startsWith("Error")) {
          throw new Error(response.type);
        }
      } catch (err) {
        editMessage(message.SendTime, {
          Content: previousContent,
          Edited: message.Edited ?? false,
        });
        log(1, "chat", "red", "Failed to edit message", err);
        toast("error", "Failed to edit message", String(err));
      }
    },
    [
      chatSecret,
      editMessage,
      userId,
      message.Content,
      message.Edited,
      message.SendTime,
      send,
    ],
  );

  const groupedReactions = Object.entries(
    (message.Reactions ?? []).reduce<
      Record<string, { count: number; reactedByMe: boolean }>
    >((groups, item) => {
      const reaction = normalizeShortcode(item.Reaction);
      if (!reaction) return groups;

      const group = groups[reaction] ?? {
        count: 0,
        reactedByMe: false,
      };
      group.count += 1;
      group.reactedByMe ||= item.SenderId === ownId;
      groups[reaction] = group;
      return groups;
    }, {}),
  );

  function toggleReaction(reaction: string) {
    const reactedByMe = message.Reactions?.some(
      (item) =>
        normalizeShortcode(item.Reaction) === reaction &&
        item.SenderId === ownId,
    );

    if (reactedByMe) {
      return removeReaction(message.SendTime, reaction);
    }

    recordUse(reaction);
    return addReaction(message.SendTime, reaction);
  }

  return (
    <div
      // pt-3 is to get a gap between messages
      className={`${grouped ? "" : "pt-3"} w-full flex justify-start transition-opacity duration-150 ${opacityClass}`}
    >
      {user && message.Content ? (
        <MessageContextMenu
          content={message.Content}
          hideMiniMenu={editing}
          isOwnMessage={message.SenderId === ownId}
          messageId={message.SendTime}
          onReact={toggleReaction}
          onSetEditing={setEditing}
        >
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
              <div
                className={cn("flex flex-col group", {
                  "min-w-0 flex-1": editing,
                })}
              >
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
                      {actuallyFailed && (
                        <AlertTriangle color="var(--destructive)" size={12} />
                      )}
                    </div>
                  </div>
                )}
                {editing ? (
                  <div className="flex w-full flex-col">
                    <Input
                      className="w-full"
                      styled
                      setValue={setEditDraft}
                      value={editDraft}
                      onSubmit={() => {
                        submitEditMessage(editDraft);
                        setEditing(false);
                      }}
                    />
                    <div className="flex">
                      <Button
                        size="xs"
                        variant="link"
                        className="text-primary-foreground-alt"
                        onClick={() => {
                          if (editDraft === message.Content) {
                            deleteMessage(message.SendTime);
                          } else {
                            submitEditMessage(editDraft);
                          }
                          setEditDraft(message.Content);
                          setEditing(false);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="xs"
                        variant="link"
                        className="text-muted-foreground"
                        onClick={() => {
                          setEditDraft(message.Content);
                          setEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : isValidURL ? (
                  <Media link={message.Content} />
                ) : (
                  <Text value={message.Content} />
                )}
                {groupedReactions.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pb-1">
                    {groupedReactions.map(
                      ([reaction, { count, reactedByMe }]) => (
                        <Button
                          key={reaction}
                          aria-label={`${reactedByMe ? "Remove" : "Add"} ${reaction} reaction`}
                          className={cn(
                            "h-7 gap-2 rounded-lg py-3.5 px-1.5! border",
                            reactedByMe
                              ? "border-(--primary-foreground-alt)/40!"
                              : "",
                          )}
                          onClick={() => void toggleReaction(reaction)}
                          size="xs"
                          variant={reactedByMe ? "subtleDefault" : "outline"}
                        >
                          <Emoji className="h-5 w-5" shortcode={reaction} />
                          <span className="text-sm">{count}</span>
                        </Button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </>
          </div>
        </MessageContextMenu>
      ) : (
        <Skeleton className="h-10 w-30" />
      )}
    </div>
  );
}

export default memo(MessageComponent, (prev, next) => {
  return (
    prev.message.SendTime === next.message.SendTime &&
    prev.message.Content === next.message.Content &&
    prev.message.SenderId === next.message.SenderId &&
    prev.message.MessageState === next.message.MessageState &&
    prev.message.failed === next.message.failed &&
    prev.message.decryptionFailed === next.message.decryptionFailed &&
    JSON.stringify(prev.message.Reactions) ===
      JSON.stringify(next.message.Reactions) &&
    prev.grouped === next.grouped &&
    prev.user === next.user
  );
});
