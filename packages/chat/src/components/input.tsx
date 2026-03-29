import Input from "@tensamin/markdown/input";
import { Card, CardHeader } from "@tensamin/ui/cmp/card";
import { useStorage } from "@tensamin/storage/context";
import * as React from "react";
import { Button } from "@tensamin/ui/cmp/button";

import { Plus, Laugh, Clapperboard } from "lucide-react";
import { useChat } from "../context";
import { useSocket } from "@tensamin/ttp/context";
import { useCrypto } from "@tensamin/crypto/context";
import { log, toast } from "@tensamin/shared/log";

export default function InputComponent() {
  const [value, setValue] = React.useState("");
  const [invertEnterBehavior, setInvertEnterBehavior] = React.useState(false);

  const { encrypt } = useCrypto();
  const { send } = useSocket();
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
    const currentUserId = userId();
    const currentSharedSecret = sharedSecret();

    if (!Number.isSafeInteger(currentUserId) || currentUserId <= 0) {
      toast("error", "No conversation selected");
      return;
    }

    if (!currentSharedSecret) {
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
    });

    const encryptedContext = await encrypt(currentSharedSecret, currentValue);

    send("message_send", {
      height,
      content: encryptedContext,
      receiver_id: currentUserId,
      send_time: time,
    }).catch((e) => {
      log(0, "Chat", "red", "Failed to send message", e, {
        content: currentValue,
        encryptedContext,
        receiver_id: currentUserId,
        send_time: time,
      });
      reference.setFailed(true);
      toast("error", "Failed to send message");
    });

    setValue("");
  }

  return (
    <Card className="rounded-none rounded-t-xl border-b-0 pt-0">
      <CardHeader className="p-0 flex flex-col">
        <Input
          placeholder="Send a message..."
          value={value}
          setValue={setValue}
          onSubmit={handleSubmit}
          invertEnterBehavior={invertEnterBehavior}
        />
        <div className="w-full flex justify-between gap-2 p-2 pt-0">
          <div className="flex gap-2">
            <Button className="w-9 h-9 p-0" variant="ghost">
              <Plus size={20} />
            </Button>
            <div className="w-auto flex">
              <p>Files list</p>
            </div>
          </div>
          <div className="flex gap-2">
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
