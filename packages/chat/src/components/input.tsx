import Input from "@tensamin/markdown/input";
import { Card, CardHeader } from "@tensamin/ui";
import { useStorage } from "@tensamin/storage/context";
import * as React from "react";
import { Button } from "@tensamin/ui";

import { Plus, Laugh, Clapperboard } from "lucide-react";
import { useChat } from "../context";
import { useTTP } from "@tensamin/ttp";
import { log, toast } from "@tensamin/shared/log";
import { cn, useIsMobile } from "@tensamin/ui";
import { encryptText } from "@tensamin/crypto/worker";

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
  const { load } = useStorage();

  React.useEffect(() => {
    void load("settings.reverse_enter_behavior").then((shouldInvert) => {
      setInvertEnterBehavior(shouldInvert);
    });
  }, [load]);

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

    const reference = addLiveMessage({
      height: 0,
      not_encrypted: true,
      send_time: time,
      content: currentValue,
      sent_by_self: true,
      message_state: "awaiting",
    });

    const encryptedContext = await encryptText(sharedSecret, currentValue);

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

    setValue("");
  }

  const isMobile = useIsMobile();

  return (
    <Card
      ref={inputBoxRef}
      className={cn(
        "rounded-none border-b-0 pt-0 pb-[env(safe-area-inset-bottom)] mx-2",
        isMobile
          ? "border-0 border-t fixed w-full bottom-0 left-0 px-2"
          : "rounded-t-xl",
      )}
    >
      <CardHeader className="relative p-0 flex flex-col">
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
