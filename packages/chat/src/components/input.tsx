import { Input, type InputController } from "@methanium/ui/markdown";
import {
  Card,
  CardHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { Button } from "@methanium/ui";

import { Plus, Laugh, FileVideo, SendHorizonal } from "lucide-react";
import { useChat, useReplyMessage } from "../context";
import { useMTP } from "@tensamin/mtp";
import { log, toast } from "@tensamin/shared/log";
import { cn, useIsMobile } from "@methanium/ui";
import { encryptChatText } from "@tensamin/crypto/chatSecret";

import { useSession } from "@tensamin/storage/session";
import EmojiPicker from "./emoji/emojiPicker";
import { useEmojiRanks, useRecordEmojiUse } from "./emoji/emojiRanks";
import GifPicker from "./media/gifPicker";
import ReplyBox from "./replyBox";
import { useHotkey } from "@tensamin/hotkeys";
import { editLastMessageHotkey } from "../hotkeys";

export default function InputComponent({
  value,
  setValue,
  onEditLastMessage,
}: {
  value: string;
  setValue: (value: string) => void;
  onEditLastMessage: () => void;
}) {
  const [invertEnterBehavior, setInvertEnterBehavior] = useState(false);

  const { send } = useMTP();
  const {
    addLiveMessage,
    chatSecret,
    userId,
    inputBoxRef,
    replyTo,
    setReplyTo,
  } = useChat();
  const { load, save } = useStorage();
  const { moveUserIdToTop } = useSession();
  const gifPopoverRef = useRef<HTMLDivElement>(null);
  const [gifPopoverOpen, setGifPopoverOpen] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const recordUse = useRecordEmojiUse();
  const { ranks: emojiFrequencies } = useEmojiRanks();
  const [gifPopoverSize, setGifPopoverSize] = useState<{
    width: number;
    height: number;
  }>();
  const composerRef = useRef<InputController | null>(null);
  const setComposer = useCallback((controller: InputController | null) => {
    composerRef.current = controller;
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [userId]);

  useEffect(() => {
    if (replyTo === undefined) return;

    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [replyTo]);

  useEffect(() => {
    const focusComposerOnType = (event: KeyboardEvent) => {
      const composer = composerRef.current;
      const target = event.target;
      if (
        !composer ||
        composer.hasFocus() ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'button, a[href], input, textarea, select, summary, [contenteditable], [role], [tabindex]:not([tabindex="-1"])',
          ))
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      composer.focus();
      composer.insertText(event.key);
    };

    window.addEventListener("keydown", focusComposerOnType, true);
    return () =>
      window.removeEventListener("keydown", focusComposerOnType, true);
  }, []);

  useHotkey(editLastMessageHotkey, onEditLastMessage, {
    enabled: value.length === 0,
    ignoreInputs: false,
    target: inputBoxRef,
  });

  useEffect(() => {
    void load("settings.reverse_enter_behavior").then((shouldInvert) => {
      setInvertEnterBehavior(shouldInvert);
    });
  }, [load]);

  useEffect(() => {
    void load("chat_picker_size").then((size) => {
      if (size) {
        setGifPopoverSize(size);
      }
    });
  }, [load]);

  async function handleSubmit(content = value, preserveContent = false) {
    if (content.trim() === "") return;

    const time = new Date().getTime();
    const currentValue = content;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      toast("error", "No conversation selected");
      return;
    }

    if (!chatSecret) {
      toast("error", "Still getting chat secret...");
      return;
    }

    log(3, "chat", "purple", "Message send init, adding live message ...");

    const reference = addLiveMessage({
      NotEncrypted: true,
      SendTime: time,
      Content: currentValue,
      SenderId: ownId,
      MessageState: "awaiting",
      ...(replyTo && { ReplyId: replyTo }),
    });

    log(3, "chat", "purple", "Live message added, encrypting...");

    const encryptedContent = await encryptChatText(
      chatSecret,
      currentValue,
    ).catch((err) => {
      toast("error", "Failed to encrypt message", String(err));
      reference.setFailed(true);
    });

    if (!encryptedContent) return;

    log(3, "chat", "purple", "Content encrypted, sending message...");

    send("MessageSend", {
      Content: encryptedContent,
      ReceiverId: userId,
      SendTime: time,
      ...(replyTo && { ReplyId: replyTo }),
    }).catch((e) => {
      log(0, "Chat", "red", "Failed to send message", e, {
        ReceiverId: userId,
        SendTime: time,
      });
      reference.setFailed(true);
      toast("error", "Failed to send message");
    });

    if (replyTo) {
      setReplyTo(undefined);
    }

    log(3, "chat", "purple", "Message sent");

    moveUserIdToTop(userId);

    if (!preserveContent) {
      setValue("");
    }
  }

  const isMobile = useIsMobile();

  function handleGifPopoverResizeStart(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const popover = gifPopoverRef.current;

    if (!popover) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = popover.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const minSize = 40;
    const maxSize = 720;

    function clampSize(size: number) {
      return Math.min(Math.max(size, minSize), maxSize);
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextSize = {
        width: clampSize(startWidth + startX - moveEvent.clientX),
        height: clampSize(startHeight + startY - moveEvent.clientY),
      };

      setGifPopoverSize(nextSize);
    }

    function handlePointerUp() {
      const popover = gifPopoverRef.current;

      if (popover) {
        const rect = popover.getBoundingClientRect();

        void save("chat_picker_size", {
          width: clampSize(rect.width),
          height: clampSize(rect.height),
        });
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const { ownId, replyMessage, replyUserId } = useReplyMessage();

  return (
    <div className="flex flex-col">
      {/* reply */}
      {replyTo !== undefined && (
        <ReplyBox
          edited={replyMessage?.Edited}
          content={replyMessage?.Content}
          loading={!replyMessage}
          onDismiss={() => setReplyTo(undefined)}
          userId={replyUserId ?? ownId}
          variant="composer"
        />
      )}
      <Card
        ref={inputBoxRef}
        className={cn(
          "ring-0! rounded-none border-b-0 border-t border-x border-input/70 pt-0 pb-[env(safe-area-inset-bottom)] mx-2",
          isMobile ? "border-0 border-x-0! w-full mx-0 px-2" : "rounded-t-xl",
        )}
      >
        <CardHeader className="relative p-0 flex flex-col">
          <div className="w-full flex items-center">
            <Input
              className="w-full p-2"
              onControllerChange={setComposer}
              paddingY="13px"
              paddingX="13px"
              placeholder="Send a message..."
              value={value}
              setValue={setValue}
              onSubmit={handleSubmit}
              invertEnterBehavior={invertEnterBehavior}
              emojiFrequencies={emojiFrequencies}
              onEmojiSelect={recordUse}
            />
            <Button
              onClick={() => handleSubmit(value)}
              className={cn("w-9! h-9!", isMobile ? "" : "hidden")}
            >
              <SendHorizonal />
            </Button>
          </div>
          <div className="w-full flex justify-between gap-1 p-1 pt-0">
            <div className="flex gap-1">
              <Button className="w-9 h-9! p-0" variant="ghost">
                <Plus size={20} />
              </Button>
              <div className="w-auto flex text-red-500">
                <p>Files list</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Popover
                open={emojiPopoverOpen}
                onOpenChange={setEmojiPopoverOpen}
              >
                <PopoverTrigger
                  render={({ onClick }) => (
                    <Button
                      onClick={onClick}
                      aria-label="Open emoji picker"
                      className="w-9 h-9! p-0"
                      variant="ghost"
                    >
                      <Laugh size={20} />
                    </Button>
                  )}
                />
                <PopoverContent className="w-auto p-0">
                  <EmojiPicker
                    onSelect={(shortcode) => {
                      setValue(`${value}${shortcode} `);
                      recordUse(shortcode);
                      setEmojiPopoverOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={gifPopoverOpen} onOpenChange={setGifPopoverOpen}>
                <PopoverTrigger
                  render={({ onClick }) => (
                    <Button
                      onClick={onClick}
                      className="w-9 h-9! p-0"
                      variant="ghost"
                    >
                      <FileVideo size={20} />
                    </Button>
                  )}
                />
                <PopoverContent
                  ref={gifPopoverRef}
                  className="relative h-130 w-120 min-h-80 max-h-180 min-w-80 max-w-180 overflow-hidden"
                  onTouchMoveCapture={(event) => event.stopPropagation()}
                  onWheelCapture={(event) => event.stopPropagation()}
                  style={{
                    ...gifPopoverSize,
                    maxHeight: gifPopoverSize?.height,
                  }}
                >
                  <div
                    className="absolute left-0 top-0 z-10 h-4 w-4 cursor-nwse-resize"
                    onPointerDown={handleGifPopoverResizeStart}
                  />
                  <GifPicker
                    resizeHeight={gifPopoverSize?.height}
                    resizeWidth={gifPopoverSize?.width}
                    onSelect={(url) => {
                      void handleSubmit(url, true);
                      setGifPopoverOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
