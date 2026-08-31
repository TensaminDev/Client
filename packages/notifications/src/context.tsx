import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/identity/context";
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
import { useSession } from "@tensamin/identity/session";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { decryptChatText } from "@tensamin/crypto/chatSecret";
import { log } from "@tensamin/shared/log";
import { playSound } from "@tensamin/shared/sounds";

export const context = createContext<contextType | undefined>(undefined);

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") return true;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export default function Provider(props: { children: React.ReactNode }) {
  const { subscribe } = useMTP();
  const { load } = useStorage();
  const { get } = useUser();
  const { addLiveMessage, chatSecret, getChatSecret, userId } = useChat();
  const { moveUserIdToTop } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return subscribe("MessageLive", async ({ data }) => {
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
              const options: NotificationOptions = {
                body: content,
                icon: user.Avatar || "/icons/icon-192.png",
                badge: "/icons/notification-badge.png",
                tag: `message-${user.UserId}`,
                silent: true,
              };
              if ("serviceWorker" in navigator) {
                const registration =
                  await navigator.serviceWorker.getRegistration();
                if (registration) {
                  await registration.showNotification(user.Display, {
                    ...options,
                    data: { url: `/chat?id=${user.UserId}` },
                  });
                  return;
                }
              }
              const notification = new Notification(user.Display, options);
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
    });
  }, [
    addLiveMessage,
    chatSecret,
    get,
    load,
    location.pathname,
    navigate,
    moveUserIdToTop,
    subscribe,
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
