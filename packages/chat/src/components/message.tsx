import type { RawMessage } from "../values";
import { AlertTriangle, Check, CheckLine, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type SelectedUser, useUserFields } from "@tensamin/identity/context";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  cn,
  Skeleton,
} from "@methanium/ui";
import MessageContextMenu from "./messageContextMenu";
import Media from "./media/media";
import { useStorage } from "@tensamin/storage/context";
import { requireRelaySuccess, useMTP } from "@tensamin/mtp";
import { getMessage, useChat } from "../context";
import { decryptChatText, encryptChatText } from "@tensamin/crypto/chatSecret";
import { log, toast } from "@tensamin/shared/log";
import { Emoji, Input, normalizeShortcode, Text } from "@methanium/ui/markdown";
import { useRecordEmojiUse } from "./emoji/emojiRanks";
import ReplyBox from "./replyBox";
import { useHotkey } from "@tensamin/hotkeys";
import { cancelMessageEditHotkey } from "../hotkeys";

function MessageComponent({
  editing,
  grouped,
  message,
  onSetEditing,
  user,
}: {
  editing: boolean;
  grouped: boolean;
  message: RawMessage & {
    failed?: boolean;
    decryptionFailed?: boolean;
  };
  onSetEditing: (editing: boolean) => void;
  user: SelectedUser<readonly ["UserId", "Avatar", "Display"]> | null;
}) {
  const actuallyFailed =
    Boolean(message.ErrorType) ||
    (message.failed && message.MessageState === "awaiting") ||
    message.decryptionFailed;

  // Fade-in
  const [hasFadedIn, setHasFadedIn] = useState(false);
  const opacityClass = !hasFadedIn
    ? "opacity-0"
    : message.MessageState === "awaiting"
      ? "opacity-50"
      : "opacity-100";
  const messageRef = useRef<HTMLDivElement>(null);
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
  const { send, sendSealedRelay } = useMTP();
  const [ownId, setOwnId] = useState(0);
  useEffect(() => {
    load("user_id").then(setOwnId);
  }, [load]);
  const messageStateReadUpdate = useCallback(async () => {
    const readConfirmations = await load("settings.read_confirmations");

    if (!user?.UserId || !message.RelayMessageId || ownId === 0) return;
    const [ownIota, peerIota] = await Promise.all([
      send("GetIotaData", { UserId: ownId }),
      send("GetIotaData", { UserId: user.UserId }),
    ]);
    if (ownIota.type !== "GetIotaData" || peerIota.type !== "GetIotaData") {
      throw new Error("Could not resolve an Iota for this receipt");
    }
    const response = await sendSealedRelay(
      "MessageState",
      {
        ChatPartnerId: user.UserId,
        RelayMessageId: message.RelayMessageId,
        EventAt: Date.now(),
        MessageState: readConfirmations ? "read" : "received",
        ReceiverId: user.UserId,
      },
      {
        nextHop: { kind: "iota", id: ownIota.data.IotaId },
        finalRecipientId: user.UserId,
        metadataRecipients: [
          { value: ownIota.data.PublicKey, encoding: "base64" },
          { value: peerIota.data.PublicKey, encoding: "base64" },
        ],
        contentRecipients: [
          { value: ownIota.data.PublicKey, encoding: "base64" },
          { value: peerIota.data.PublicKey, encoding: "base64" },
        ],
      },
    );
    requireRelaySuccess(response);
  }, [load, message.RelayMessageId, ownId, send, sendSealedRelay, user]);
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
    removeReaction,
    replyTo,
  } = useChat();
  const [replyMessage, setReplyMessage] = useState<RawMessage | null>(null);
  const { data: replyUser } = useUserFields(replyMessage?.SenderId ?? null, [
    "Avatar",
    "Display",
  ]);
  useEffect(() => {
    if (!message.ReplyId || !ownId || !chatSecret) {
      setReplyMessage(null);
      return;
    }

    let active = true;
    void getMessage({
      sendTime: message.ReplyId,
      ownId,
      chatPartnerId: userId,
      send,
    })
      .then(async (reply) => {
        const Content = await decryptChatText(chatSecret, reply.Content);
        if (!active) return;
        setReplyMessage({ ...reply, Content });
      })
      .catch((err) => {
        if (!active) return;
        setReplyMessage(null);
        log(1, "chat", "red", "Failed to get replied-to message", err);
      });

    return () => {
      active = false;
    };
  }, [chatSecret, message.ReplyId, ownId, send, userId]);
  const recordUse = useRecordEmojiUse();
  const editingRef = useRef(editing);
  const onSetEditingRef = useRef(onSetEditing);
  useEffect(() => {
    editingRef.current = editing;
    onSetEditingRef.current = onSetEditing;
  }, [editing, onSetEditing]);
  useEffect(
    () => () => {
      if (editingRef.current) onSetEditingRef.current(false);
    },
    [],
  );
  const [editDraft, setEditDraft] = useState(message.Content);
  const cancelEditing = useCallback(() => {
    setEditDraft(message.Content);
    onSetEditing(false);
  }, [message.Content, onSetEditing]);
  useHotkey(cancelMessageEditHotkey, cancelEditing, {
    enabled: editing,
    target: messageRef,
  });
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
      ref={messageRef}
      // pt-3 is to get a gap between messages
      className={`${grouped ? "" : "pt-3"} w-full flex flex-col gap-1 justify-start items-start transition-opacity duration-150 ${opacityClass}`}
    >
      {/* reply */}
      {replyMessage && replyUser && (
        <ReplyBox
          edited={replyMessage.Edited}
          content={replyMessage.Content}
          user={replyUser}
          variant="message"
        />
      )}
      {user && message.Content ? (
        <MessageContextMenu
          content={message.Content}
          hideMiniMenu={editing}
          isOwnMessage={message.SenderId === ownId}
          messageId={message.SendTime}
          onReact={toggleReaction}
          onSetEditing={onSetEditing}
        >
          <>
            <div
              className={cn(
                "group hover:bg-muted/50 select-text! relative justify-start flex gap-1 items-center w-full px-2 whitespace-pre-wrap break-all transition-colors duration-200 ease-in-out",
                {
                  "bg-(--destructive)/10 text-destructive-foreground hover:bg-(--destructive)/15":
                    actuallyFailed,
                  "bg-(--primary-foreground-alt)/15 hover:bg-(--primary-foreground-alt)/20":
                    replyTo === message.SendTime && !actuallyFailed,
                },
              )}
            >
              <>
                {grouped ? (
                  <p className="w-9 self-start pt-[5px] text-xs group-hover:visible invisible text-muted-foreground">
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
                  className={cn("flex flex-col group w-full", {
                    "min-w-0 flex-1": editing,
                  })}
                >
                  {!grouped && (
                    <div className="flex items-center gap-1">
                      <p className="font-semibold">{user.Display}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(message.SendTime).toLocaleString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="flex items-center justify-start gap-1">
                        {message.SenderId !==
                        ownId ? null : message.MessageState === "read" ? (
                          <Check
                            size={12}
                            color="var(--primary-foreground-alt)"
                          />
                        ) : message.MessageState === "received" ? (
                          <CheckLine
                            size={12}
                            color="var(--muted-foreground)"
                          />
                        ) : message.MessageState === "sent" ? (
                          <Check size={12} color="var(--muted-foreground)" />
                        ) : message.MessageState === "sending" ? (
                          <RefreshCw
                            size={12}
                            color="var(--muted-foreground)"
                          />
                        ) : null}
                        {actuallyFailed && (
                          <AlertTriangle color="var(--destructive)" size={12} />
                        )}
                      </div>
                    </div>
                  )}
                  {editing ? (
                    <div className="flex w-full flex-col gap-1 py-1.5">
                      <Card className="px-2! py-0! rounded-md">
                        <Input
                          autoFocus
                          className="w-full"
                          setValue={setEditDraft}
                          value={editDraft}
                          onSubmit={() => {
                            if (!editDraft.trim()) return;
                            if (editDraft !== message.Content) {
                              void submitEditMessage(editDraft);
                            }
                            onSetEditing(false);
                          }}
                        />
                      </Card>
                      <div className="flex gap-1">
                        <Button
                          size="xs"
                          variant="subtleDefault"
                          onClick={() => {
                            if (!editDraft.trim()) return;
                            if (editDraft !== message.Content) {
                              void submitEditMessage(editDraft);
                            }
                            setEditDraft(message.Content);
                            onSetEditing(false);
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1 w-full!">
                      {isValidURL ? (
                        <Media
                          link={message.Content}
                          senderId={message.SenderId}
                          time={new Date(message.SendTime).toLocaleString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        />
                      ) : (
                        <div className="min-w-0 flex-1">
                          <Text
                            showEditedIndicator={message.Edited}
                            value={message.Content}
                          />
                        </div>
                      )}
                    </div>
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
          </>
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
    prev.editing === next.editing &&
    prev.message.Content === next.message.Content &&
    prev.message.SenderId === next.message.SenderId &&
    prev.message.ReplyId === next.message.ReplyId &&
    prev.message.MessageState === next.message.MessageState &&
    prev.message.failed === next.message.failed &&
    prev.message.decryptionFailed === next.message.decryptionFailed &&
    JSON.stringify(prev.message.Reactions) ===
      JSON.stringify(next.message.Reactions) &&
    prev.grouped === next.grouped &&
    prev.user === next.user
  );
});
