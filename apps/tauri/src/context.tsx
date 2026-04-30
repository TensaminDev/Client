import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type DesktopScreenShareSource = {
  id: string;
  kind: "screen" | "window";
  name: string;
  subtitle?: string | null;
};

export type DesktopScreenShareAudioOutput = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type DesktopScreenShareCapabilities = {
  platform: "linux" | "macos" | "windows" | "other";
  usesPipeWireAudioPicker: boolean;
  supportsSystemAudioSwitch: boolean;
  supportsReliableSystemAudio: boolean;
};

type DesktopMediaContextValue = {
  isDesktopTauri: boolean;
  getScreenShareCapabilities: () => Promise<DesktopScreenShareCapabilities>;
  listScreenShareSources: () => Promise<DesktopScreenShareSource[]>;
  listScreenShareAudioOutputs: () => Promise<DesktopScreenShareAudioOutput[]>;
};

const defaultCapabilities: DesktopScreenShareCapabilities = {
  platform: "other",
  usesPipeWireAudioPicker: false,
  supportsSystemAudioSwitch: false,
  supportsReliableSystemAudio: false,
};

const desktopMediaContext = createContext<DesktopMediaContextValue | undefined>(
  undefined,
);

async function listScreenShareSources(): Promise<DesktopScreenShareSource[]> {
  if (!isTauri()) {
    return [];
  }

  return invoke<DesktopScreenShareSource[]>("list_screen_share_sources");
}

async function listScreenShareAudioOutputs(): Promise<
  DesktopScreenShareAudioOutput[]
> {
  if (!isTauri()) {
    return [];
  }

  return invoke<DesktopScreenShareAudioOutput[]>(
    "list_screen_share_audio_outputs",
  );
}

async function getScreenShareCapabilities(): Promise<DesktopScreenShareCapabilities> {
  if (!isTauri()) {
    return defaultCapabilities;
  }

  return invoke<DesktopScreenShareCapabilities>("get_screen_share_capabilities");
}

export function useDesktopMedia() {
  const value = useContext(desktopMediaContext);

  if (!value) {
    throw new Error("useDesktopMedia must be used within the desktop provider");
  }

  return value;
}

export default function Provider({ children }: { children: ReactNode }) {
  const value = useMemo<DesktopMediaContextValue>(
    () => ({
      isDesktopTauri: isTauri(),
      getScreenShareCapabilities,
      listScreenShareSources,
      listScreenShareAudioOutputs,
    }),
    [],
  );

  return (
    <desktopMediaContext.Provider value={value}>
      {children}
    </desktopMediaContext.Provider>
  );
}
