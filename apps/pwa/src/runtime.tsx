import { useEffect } from "react";
import { toast } from "sonner";

import { setDatabaseEntry } from "@tensamin/shared/indexedDb";
import { isTauri } from "@tauri-apps/api/core";

import "./style.css";

const launchedFiles: File[] = [];
const fileListeners = new Set<(file: File) => void>();

function emitLaunchedFile(file: File) {
  if (fileListeners.size === 0) launchedFiles.push(file);
  else for (const listener of fileListeners) listener(file);
}

export function subscribeTuFileLaunch(listener: (file: File) => void) {
  fileListeners.add(listener);
  for (const file of launchedFiles.splice(0)) listener(file);
  return () => {
    fileListeners.delete(listener);
  };
}

function isInstalledPwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function applicationServerKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function enablePush() {
  if (!("Notification" in window))
    throw new Error("Notifications are not supported by this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted.");

  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY;
  if (
    !publicKey ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  await setDatabaseEntry("keys", "push-subscription", subscription.toJSON());
}

function InstalledPwaRuntime() {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !["http:", "https:"].includes(window.location.protocol)
    ) {
      return;
    }
    let reloading = false;
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      // A newly activated service worker must reload the document it controls.
      // eslint-disable-next-line tensamin/no-window-location-reload
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    void navigator.serviceWorker
      .register(
        import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/serviceWorker.js",
        {
          type: "module",
        },
      )
      .then((registration) => {
        const watchWorker = (worker: ServiceWorker) => {
          worker.addEventListener("statechange", () => {
            if (worker.state !== "installed") return;
            if (!navigator.serviceWorker.controller) {
              toast.success("Tensamin is ready for offline startup");
              return;
            }
            toast("A Tensamin update is ready", {
              duration: Infinity,
              action: {
                label: "Update",
                onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
              },
            });
          });
        };
        if (registration.installing) watchWorker(registration.installing);
        registration.addEventListener("updatefound", () => {
          if (registration.installing) watchWorker(registration.installing);
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to register the Tensamin service worker", error);
      });
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  useEffect(() => {
    const launchQueue = (
      window as Window & {
        launchQueue?: {
          setConsumer: (
            consumer: (params: {
              files?: Array<{ getFile: () => Promise<File> }>;
            }) => void,
          ) => void;
        };
      }
    ).launchQueue;
    launchQueue?.setConsumer((params) => {
      for (const handle of params.files ?? []) {
        void handle.getFile().then(emitLaunchedFile);
      }
    });
  }, []);

  useEffect(() => {
    if (
      !("Notification" in window) ||
      Notification.permission !== "default" ||
      localStorage.getItem("pwa-push-hint")
    ) {
      return;
    }
    localStorage.setItem("pwa-push-hint", "shown");
    toast("Enable message notifications", {
      duration: Infinity,
      action: {
        label: "Enable",
        onClick: () => {
          void enablePush()
            .then(() => toast.success("Notifications enabled"))
            .catch((error: unknown) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not enable notifications",
              ),
            );
        },
      },
    });
  }, []);

  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "granted" &&
      import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
    ) {
      void enablePush().catch((error: unknown) => {
        console.error("Failed to refresh the Web Push subscription", error);
      });
    }
  }, []);

  return null;
}

export default function PwaRuntime() {
  if (isTauri() || !isInstalledPwa()) return null;
  return <InstalledPwaRuntime />;
}
