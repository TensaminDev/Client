import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getAppFocused, subscribeAppFocus } from "@tensamin/shared/focus";
import { log } from "@tensamin/shared/log";

import type { BoundSendFn } from "./mtpContext";

function isElectron() {
  return "tensaminDesktop" in window;
}

function getDeviceClass(): "desktop" | "mobile" | "web" {
  if (isTauri()) return "mobile";
  if (isElectron()) return "desktop";
  if (/Android|iPhone|iPad/i.test(navigator.userAgent)) return "mobile";

  return "web";
}

export function useSessionActivity({
  connected,
  send,
}: {
  connected: boolean;
  send: BoundSendFn;
}) {
  const [deviceClass] = useState(getDeviceClass);
  const last = useRef<{
    DeviceClass: "desktop" | "mobile" | "web";
    Foreground: boolean;
    NotificationCapable: boolean;
  } | null>(null);

  useEffect(() => {
    if (!connected) {
      last.current = null;
      return;
    }

    const publishActivity = () => {
      const next = {
        DeviceClass: deviceClass,
        Foreground: getAppFocused(),
        NotificationCapable: true,
      };
      if (
        last.current?.DeviceClass === next.DeviceClass &&
        last.current.Foreground === next.Foreground &&
        last.current.NotificationCapable === next.NotificationCapable
      ) {
        return;
      }

      last.current = next;
      void send("SessionActivitySet", next).catch((error) => {
        log(1, "mtp", "yellow", "Failed to publish session activity", error);
      });
    };

    publishActivity();
    const unsubscribe = subscribeAppFocus(publishActivity);
    return () => {
      unsubscribe();
      last.current = null;
    };
  }, [connected, deviceClass, send]);
}
