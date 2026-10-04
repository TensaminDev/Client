import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { isTauri } from "@tauri-apps/api/core";
import { log } from "@tensamin/shared/log";

export const deeplinkContext = createContext<
  | {
      deeplinks: readonly string[];
    }
  | undefined
>(undefined);

export function useDeeplinks() {
  const value = useContext(deeplinkContext);
  if (!value) {
    throw new Error("useDeeplinks must be used within DeeplinkProvider");
  }

  return value;
}

export default function DeeplinkProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [deeplinks, setDeeplinks] = useState<string[]>([]);
  useEffect(() => {
    if (!isTauri()) return;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    onOpenUrl((links) => {
      log(
        0,
        "deeplink",
        "blue",
        "Received links",
        links.map((link) => {
          try {
            return new URL(link).hostname;
          } catch {
            return "malformed";
          }
        }),
      );
      if (mounted) {
        setDeeplinks((prev) => [...prev, ...links]);
      }
    }).then((fn) => {
      if (!mounted) {
        fn();
        return;
      }
      unlisten = fn;
      return getCurrent().then((links) => {
        if (mounted && links) setDeeplinks((prev) => [...prev, ...links]);
        if (links?.length)
          log(0, "deeplink", "blue", "Loaded launch links", links.length);
      });
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(
    () =>
      window.tensaminDesktop?.deepLinks?.onOpened?.((url) =>
        setDeeplinks((previous) => [...previous, url]),
      ),
    [],
  );

  return (
    <deeplinkContext.Provider
      value={{
        deeplinks,
      }}
    >
      {children}
    </deeplinkContext.Provider>
  );
}
