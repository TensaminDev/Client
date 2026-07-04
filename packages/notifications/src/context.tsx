import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { useChat } from "@tensamin/chat/context";
import { useMTP } from "@tensamin/mtp";
import { createContext, useEffect, useContext } from "react";
import z from "zod";
import { toast as sonnerToast } from "sonner";
import { Message as MessageSchema } from "@tensamin/shared/data";
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
      if (ttpMessage.type === "MessageLive") {
        const { message, SenderId } = ttpMessage.data as {
          message: z.infer<typeof MessageSchema>;
          SenderId: number;
        };

        const user = await get(SenderId);

        const decryptedContent = await decryptText(
          await getSharedSecret(
            await load("mtp_keyring"),
            await get(await load("user_id")).then((data) => data.PublicKey),
            user.PublicKey,
          ),
          message.Content,
        );

        // Update message state
        if (userId === SenderId) {
          addLiveMessage({
            ...message,
            Content: decryptedContent,
            SentBySelf: false,
          });
          return;
        }

        // todo: add notification symbol to conversation cards (incl. message start)

        moveUserIdToTop(SenderId);

        if (await load("settings.receive_confirmations")) {
          void send(
            "MessageState",
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
            const notification = new Notification(user.Display, {
              body: decryptedContent,
              icon: user.Avatar || user.Display.slice(0, 2).toUpperCase(),
              badge: user.Avatar || user.Display.slice(0, 2).toUpperCase(),
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
            sonnerToast(user.Display, {
              classNames: {
                content: "pl-4",
              },
              description: decryptedContent,
              icon: (
                <Avatar>
                  <AvatarImage src={user.Avatar} />
                  <AvatarFallback>
                    {user.Display.slice(0, 2).toUpperCase()}
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
