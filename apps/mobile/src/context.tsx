import { isTauri } from "@tauri-apps/api/core";
import { createContext, useEffect } from "react";

type contextType = {
  isTauri: boolean;
};

export const context = createContext<contextType | undefined>(undefined);

export default function Provider({ children }: { children: React.ReactNode }) {
  const isTauriVar = isTauri();

  useEffect(() => {
    if (!isTauriVar) return;

    document.body.classList.add("");
  }, [isTauriVar]);

  return (
    <context.Provider
      value={{
        isTauri: isTauriVar,
      }}
    >
      {children}
    </context.Provider>
  );
}
