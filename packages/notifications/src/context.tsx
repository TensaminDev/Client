import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { useChat } from "@tensamin/chat/context";
import { useMTP } from "@tensamin/mtp";
import { createContext, useEffect, useContext } from "react";
import { toast as sonnerToast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@methanium/ui";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted as isTauriNotificationPermissionGranted,
  requestPermission as requestTauriNotificationPermission,
  sendNotification as sendTauriNotification,
} from "@tauri-apps/plugin-notification";
import { useSession } from "@tensamin/storage/session";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { decryptChatText } from "@tensamin/crypto/chatSecret";
import { log } from "@tensamin/shared/log";
import { playSound } from "@tensamin/shared/sounds";
import { type RawMessage } from "@tensamin/chat/values";

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
  const { addLiveMessage, chatSecret, getChatSecret, userId } = useChat();
  const { moveUserIdToTop } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return subscribePush(async (message) => {
      if (message.type === "MessageLive") {
        const data = message.data as {
          Message?: RawMessage;
          SenderId?: number;
        };

        if (!data.SenderId) return;

        const isCurrentChat =
          location.pathname === "/chat" && userId === data.SenderId;
        const appFocused =
          document.hasFocus() && document.visibilityState === "visible";
        const shouldAlert = !isCurrentChat || !appFocused;

        const messageSecret =
          isCurrentChat && chatSecret
            ? chatSecret
            : await getChatSecret(data.SenderId);

        if (!data.Message || !messageSecret) return;
        if (shouldAlert) playSound("message");

        void decryptChatText(messageSecret, data.Message.Content)
          .catch((err) => {
            log(1, "chat", "red", "Failed to decrypt live message", err, {
              SendTime: data.Message?.SendTime,
            });
            return null;
          })
          .then(async (content) => {
            if (!data.Message || !content || !data.SenderId) return;

            if (isCurrentChat) {
              addLiveMessage({
                ...data.Message,
                Content: content ?? "Failed to decrypt message",
                decryptionFailed: content === null,
              });
            }

            if (!shouldAlert) return;

            if (!isCurrentChat) {
              // todo: add notification symbol to conversation cards (incl. message start)
              moveUserIdToTop(data.SenderId);

              if (await load("settings.receive_confirmations")) {
                void send(
                  "MessageState",
                  {
                    MessageState: "received",
                  },
                  {
                    id: data.Message.SendTime,
                  },
                );
              }
            }

            const user = await get(data.SenderId, [
              "UserId",
              "Display",
              "Avatar",
            ]);

            if (isTauri()) {
              if (!appFocused) return;
              const permissionGranted =
                (await isTauriNotificationPermissionGranted()) ||
                (await requestTauriNotificationPermission()) === "granted";

              if (permissionGranted) {
                let handledNatively = false;
                try {
                  handledNatively = await invoke<boolean>(
                    "mtp_post_message_notification",
                    {
                      senderId: user.UserId,
                      sender: user.Display,
                      body: content,
                      avatar: user.Avatar,
                    },
                  );
                } catch (error) {
                  log(
                    1,
                    "notifications",
                    "red",
                    "Failed to create native message notification",
                    error,
                  );
                }

                if (!handledNatively) {
                  sendTauriNotification({ title: user.Display, body: content });
                }
              }
            } else {
              const hasPermissions = await requestNotificationPermission();

              if (hasPermissions) {
                const notification = new Notification(user.Display, {
                  body: content,
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
                  description: content,
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
          });
        return;
      }
    });
  }, [
    addLiveMessage,
    chatSecret,
    get,
    load,
    location.pathname,
    navigate,
    send,
    moveUserIdToTop,
    subscribePush,
    getChatSecret,
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
