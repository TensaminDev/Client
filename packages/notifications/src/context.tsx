import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { useChat } from "@tensamin/chat/context";
import { useTTP } from "@tensamin/ttp";
import { createContext, useEffect, useContext } from "react";
import z from "zod";
import { toast as sonnerToast } from "sonner";
import { message as messageSchema } from "@tensamin/shared/data";
import { Avatar, AvatarFallback, AvatarImage } from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";

export const context = createContext<contextType | undefined>(undefined);

function reduceDisplay(display: string) {
  const words = display.split(" ");
  if (words.length === 1) {
    return display.slice(0, 2).toUpperCase();
  } else {
    return words[0].charAt(0).toUpperCase() + words[1].charAt(0).toUpperCase();
  }
}

export default function Provider(props: { children: React.ReactNode }) {
  const { subscribePush } = useTTP();
  const { load } = useStorage();
  const { get } = useUser();
  const { decryptText, getSharedSecret } = useCrypto();
  const { addLiveMessage, userId } = useChat();

  useEffect(() => {
    return subscribePush(async (ttpMessage) => {
      if (ttpMessage.type === "message_live") {
        const { message, sender_id } = ttpMessage.data as {
          message: z.infer<typeof messageSchema>;
          sender_id: number;
        };

        const user = await get(sender_id);

        const decryptedContent = await decryptText(
          await getSharedSecret(
            await load("private_key"),
            await get(await load("user_id")).then((data) => data.public_key),
            user.public_key,
          ),
          message.content,
        );

        console.log(userId, sender_id, userId === sender_id);
        if (userId === sender_id) {
          addLiveMessage({
            ...message,
            content: decryptedContent,
            sent_by_self: false,
          });

          return;
        }

        // add notification symbol to conversation cards

        if (isTauri()) {
          console.log("weewoo");
        } else {
          sonnerToast(user.display, {
            classNames: {
              content: "pl-4",
            },
            description: decryptedContent,
            icon: (
              <Avatar>
                <AvatarImage src={user.avatar} />
                <AvatarFallback>{reduceDisplay(user.display)}</AvatarFallback>
              </Avatar>
            ),
          });
        }
      }
    });
  }, [
    subscribePush,
    decryptText,
    getSharedSecret,
    load,
    get,
    addLiveMessage,
    userId,
  ]);

  return (
    <context.Provider value={{ test: () => {} }}>
      {props.children}
    </context.Provider>
  );
}

type contextType = {
  test: () => void;
};

/**
 * Executes useNotifications.
 * @param none This function has no parameters.
 * @returns contextType.
 */
export function useNotifications(): contextType {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useNotifications must be used within a ChatProvider");
  }
  return ctx;
}
