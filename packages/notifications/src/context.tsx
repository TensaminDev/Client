import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { useChat } from "@tensamin/chat/context";
import { useMTP } from "@tensamin/mtp";
import { createContext, useEffect, useContext } from "react";
import z from "zod";
import { toast as sonnerToast } from "sonner";
import { message as messageSchema } from "@tensamin/shared/data";
import { Avatar, AvatarFallback, AvatarImage } from "@tensamin/ui";
import { isTauri } from "@tauri-apps/api/core";
import { useSession } from "@tensamin/storage/session";
import { useNavigate } from "@tanstack/react-router";

export const context = createContext<contextType | undefined>(undefined);

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") return true;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export default function Provider(props: { children: React.ReactNode }) {
  const { subscribePush, send } = useMTP();
  const { load } = useStorage();
  const { get } = useUser();
  const { decryptText, getSharedSecret } = useCrypto();
  const { addLiveMessage, userId } = useChat();
  const { moveUserIdToTop } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    return subscribePush(async (ttpMessage) => {
      if (ttpMessage.type === "message_live") {
        const { message, SenderId } = ttpMessage.data as {
          message: z.infer<typeof messageSchema>;
          SenderId: number;
        };

        const user = await get(SenderId);

        const decryptedContent = await decryptText(
          await getSharedSecret(
            await load("private_key"),
            await get(await load("user_id")).then((data) => data.PublicKey),
            user.PublicKey,
          ),
          message.content,
        );

        // Update message state
        if (userId === SenderId) {
          addLiveMessage({
            ...message,
            content: decryptedContent,
            SentBySelf: false,
          });
          return;
        }

        // todo: add notification symbol to conversation cards (incl. message start)

        moveUserIdToTop(SenderId);

        if (await load("settings.receive_confirmations")) {
          void send(
            "message_state",
            {
              MessageState: "received",
            },
            {
              id: ttpMessage.id,
            },
          );
        }

        if (isTauri()) {
          console.log("weewoo");
        } else {
          const hasPermissions = await requestNotificationPermission();

          if (hasPermissions) {
            const notification = new Notification(user.display, {
              body: decryptedContent,
              icon: user.avatar || user.display.slice(0, 2).toUpperCase(),
              badge: user.avatar || user.display.slice(0, 2).toUpperCase(),
              tag: `message-${user.UserId}`,
              silent: true,
            });

            notification.onclick = () => {
              window.focus();
              navigate({
                to: `/chat?id=${user.UserId}`,
              });

              notification.close();
            };
          } else {
            sonnerToast(user.display, {
              classNames: {
                content: "pl-4",
              },
              description: decryptedContent,
              icon: (
                <Avatar>
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>
                    {user.display.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ),
            });
          }
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
    moveUserIdToTop,
    send,
    navigate,
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
