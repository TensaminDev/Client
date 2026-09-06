import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { isTauri } from "@tauri-apps/api/core";
import { useIsMobile } from "@methanium/ui";

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
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isTauri() || !isMobile) return;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    getCurrent().then((links) => {
      if (mounted && links) {
        setDeeplinks((prev) => [...prev, ...links]);
      }
    });

    onOpenUrl((links) => {
      if (mounted) {
        setDeeplinks((prev) => [...prev, ...links]);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [isMobile]);

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
