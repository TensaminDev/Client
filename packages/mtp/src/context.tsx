import { type ReactNode, useContext, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { MTPClient } from "mtp";

import { BrowserProvider } from "./browser";
import { MTPContext, type MTPContextType } from "./mtpContext";
import { TauriProvider } from "./tauri";

export function Provider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  if (isTauri()) return <TauriProvider {...props} />;
  return <BrowserWasmProvider {...props} />;
}

function BrowserWasmProvider(props: {
  children: ReactNode;
  blockConnection?: boolean;
}) {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    void MTPClient.init().then(
      () => active && setWasmReady(true),
      (error: unknown) => active && setWasmError(() => error),
    );
    return () => {
      active = false;
    };
  }, []);
  if (wasmError) throw wasmError;
  return wasmReady ? <BrowserProvider {...props} /> : null;
}

export function useMTP(): MTPContextType {
  const context = useContext(MTPContext);
  if (!context) throw new Error("useMTP must be used within an MTPProvider");
  return context;
}
