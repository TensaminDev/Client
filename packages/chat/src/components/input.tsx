import Input from "@tensamin/markdown/input";
import {
  Card,
  CardHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tensamin/ui";
import { useStorage } from "@tensamin/storage/context";
import * as React from "react";
import { Button } from "@tensamin/ui";

import { Plus, Laugh, FileVideo } from "lucide-react";
import { useChat } from "../context";
import { useTTP } from "@tensamin/ttp";
import { log, toast } from "@tensamin/shared/log";
import { cn, useIsMobile } from "@tensamin/ui";
import { encryptText } from "@tensamin/crypto/worker";
import { useSession } from "@tensamin/storage/session";
import GifPicker from "./gifPicker";

export default function InputComponent({
  value,
  setValue,
}: {
  value: string;
  setValue: (value: string) => void;
}) {
  const [invertEnterBehavior, setInvertEnterBehavior] = React.useState(false);

  const { send } = useTTP();
  const { addLiveMessage, sharedSecret, userId, inputBoxRef } = useChat();
  const { load, save } = useStorage();
  const { moveUserIdToTop } = useSession();
  const gifPopoverRef = React.useRef<HTMLDivElement>(null);
  const [gifPopoverOpen, setGifPopoverOpen] = React.useState(false);
  const [gifPopoverSize, setGifPopoverSize] = React.useState<{
    width: number;
    height: number;
  }>();

  React.useEffect(() => {
    void load("settings.reverse_enter_behavior").then((shouldInvert) => {
      setInvertEnterBehavior(shouldInvert);
    });
  }, [load]);

  React.useEffect(() => {
    void load("chat_picker_size").then((size) => {
      if (size) {
        setGifPopoverSize(size);
      }
    });
  }, [load]);

  async function handleSubmit(content = value, preserveContent = false) {
    if (content.trim() === "") return;

    const time = Date.now();
    const currentValue = content;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      toast("error", "No conversation selected");
      return;
    }

    if (!sharedSecret) {
      toast("error", "Still getting shared secret...");
      return;
    }

    log(3, "chat", "purple", "Message send init, adding live message ...");

    const reference = addLiveMessage({
      height: 0,
      not_encrypted: true,
      send_time: time,
      content: currentValue,
      sent_by_self: true,
      message_state: "awaiting",
    });

    log(3, "chat", "purple", "Live message added, encrypting...");

    const encryptedContext = await encryptText(
      sharedSecret,
      currentValue,
    ).catch((err) => {
      toast("error", "Failed to encrypt message", String(err));
      reference.setFailed(true);
    });

    if (!encryptedContext) return;

    log(3, "chat", "purple", "Content encrypted, sending message...");

    send("message_send", {
      height: 0,
      content: encryptedContext,
      receiver_id: userId,
      send_time: time,
    }).catch((e) => {
      log(0, "Chat", "red", "Failed to send message", e, {
        content: currentValue,
        encryptedContext,
        receiver_id: userId,
        send_time: time,
      });
      reference.setFailed(true);
      toast("error", "Failed to send message");
    });

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

  return (
    <Card
      ref={inputBoxRef}
      className={cn(
        "ring-0! rounded-none border-b-0 border-t border-x border-input/70 pt-0 pb-[env(safe-area-inset-bottom)] mx-2",
        isMobile ? "border-0 border-x-0! w-full mx-0 px-2" : "rounded-t-xl",
      )}
    >
      <CardHeader className="relative p-0 flex flex-col">
        <Input
          className="w-full"
          paddingY="13px"
          paddingX="13px"
          placeholder="Send a message..."
          value={value}
          setValue={setValue}
          onSubmit={handleSubmit}
          invertEnterBehavior={invertEnterBehavior}
        />
        <div className="w-full flex justify-between gap-1 p-1 pt-0">
          <div className="flex gap-1">
            <Button className="w-9 h-9 p-0" variant="ghost">
              <Plus size={20} />
            </Button>
            <div className="w-auto flex text-red-500">
              <p>Files list</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button className="w-9 h-9 p-0" variant="ghost">
              <Laugh size={20} />
            </Button>
            <Popover open={gifPopoverOpen} onOpenChange={setGifPopoverOpen}>
              <PopoverTrigger
                render={
                  <Button className="w-9 h-9 p-0" variant="ghost">
                    <FileVideo size={20} />
                  </Button>
                }
              />
              <PopoverContent
                ref={gifPopoverRef}
                className="relative min-h-80 max-h-180 min-w-80 max-w-180 overflow-hidden"
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
  );
}
