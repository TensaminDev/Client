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

export default function InputComponent({
  value,
  setValue,
}: {
  value: string;
  setValue: (value: string) => void;
}) {
  const [invertEnterBehavior, setInvertEnterBehavior] = React.useState(false);

  const { encrypt } = useCrypto();
  const { send } = useTTP();
  const { addLiveMessage, sharedSecret, userId } = useChat();
  const { load } = useStorage();

  React.useEffect(() => {
    void load("chat_invert_enter_behaviour").then((shouldInvert) => {
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

    const height = currentValue.split("\n").length * 24 + 16; // 24px per line + 16px padding

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

  return (
    <Card className="rounded-none rounded-t-xl border-b-0 pt-0 pb-[env(safe-area-inset-bottom)]">
      <CardHeader className="p-0 flex flex-col">
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
