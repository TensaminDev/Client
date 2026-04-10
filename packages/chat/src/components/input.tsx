import Input from "@tensamin/markdown/input";
import { Card, CardHeader } from "@tensamin/ui/cmp/card";
import { useStorage } from "@tensamin/storage/context";
import * as React from "react";
import { Button } from "@tensamin/ui/cmp/button";

import { Plus, Laugh, Clapperboard } from "lucide-react";
import { useChat } from "../context";
import { useTTP } from "@tensamin/ttp/context";
import { useCrypto } from "@tensamin/crypto/context";
import { log, toast } from "@tensamin/shared/log";
import Message from "./message";
import { cn, useIsMobile } from "@tensamin/ui/utils";

export default function InputComponent({
  value,
  setValue,
}: {
  value: string;
  setValue: (value: string) => void;
}) {
  const [invertEnterBehavior, setInvertEnterBehavior] = React.useState(false);
  const measurementRef = React.useRef<HTMLDivElement | null>(null);

  const { encrypt } = useCrypto();
  const { send } = useTTP();
  const { addLiveMessage, sharedSecret, userId } = useChat();
  const { load } = useStorage();

  React.useEffect(() => {
    void load("settings.reverse_enter_behavior").then((shouldInvert) => {
      setInvertEnterBehavior(shouldInvert);
    });
  }, [load]);

  const getRenderedHeight = React.useCallback(() => {
    const measuredHeight =
      measurementRef.current?.getBoundingClientRect().height;

    if (
      typeof measuredHeight === "number" &&
      Number.isFinite(measuredHeight) &&
      measuredHeight > 0
    ) {
      return Math.ceil(measuredHeight);
    }

    return 40;
  }, []);

  /**
   * Executes handleSubmit.
   * @param none This function has no parameters.
   * @returns unknown.
   */
  async function handleSubmit() {
    if (value.trim() === "") return;

    const time = Date.now();
    const currentValue = value;

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      toast("error", "No conversation selected");
      return;
    }

    if (!sharedSecret) {
      toast("error", "Still getting shared secret...");
      return;
    }

    const height = getRenderedHeight();

    const reference = addLiveMessage({
      height,
      not_encrypted: true,
      timestamp: time,
      content: currentValue,
      sent_by_self: true,
      message_state: "awaiting",
    });

    const encryptedContext = await encrypt(sharedSecret, currentValue);

    send("message_send", {
      height,
      content: encryptedContext,
      receiver_id: userId,
      timestamp: time,
    }).catch((e) => {
      log(0, "Chat", "red", "Failed to send message", e, {
        content: currentValue,
        encryptedContext,
        receiver_id: userId,
        timestamp: time,
      });
      reference.setFailed(true);
      toast("error", "Failed to send message");
    });

    setValue("");
  }

  const isMobile = useIsMobile();

  return (
    <Card
      className={cn(
        "rounded-none border-b-0 pt-0 pb-[env(safe-area-inset-bottom)]",
        isMobile
          ? "border-0 border-t-1 fixed w-full bottom-0 left-0 px-2"
          : "rounded-t-xl",
      )}
    >
      <CardHeader className="relative p-0 flex flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 w-full px-2.5 opacity-0"
          style={{ visibility: "hidden" }}
        >
          <Message
            measureRef={measurementRef}
            message={{
              height: 0,
              not_encrypted: true,
              timestamp: 0,
              content: value,
              sent_by_self: true,
              message_state: "awaiting",
            }}
            notEncrypted
          />
        </div>
        <Input
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
            <Button className="w-9 h-9 p-0" variant="ghost">
              <Clapperboard size={20} />
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
