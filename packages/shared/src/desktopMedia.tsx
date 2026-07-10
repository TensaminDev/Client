import { createContext, useContext, useMemo, type ReactNode } from "react";

export type DesktopScreenShareSource = {
  id: string;
  kind: "screen" | "window";
  name: string;
  subtitle?: string | null;
  thumbnail?: string | null;
};

export type DesktopScreenShareAudioOutput = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type DesktopScreenShareCapabilities = {
  runtime?: "electron" | "tauri";
  platform: "linux" | "macos" | "windows" | "other";
  showAudioOutputSelector: boolean;
  showAudioSwitch: boolean;
  hasReliableSystemAudio: boolean;
};

type ElectronDesktopApi = {
  media?: {
    getScreenShareCapabilities?: () => Promise<DesktopScreenShareCapabilities>;
    listScreenShareSources?: () => Promise<DesktopScreenShareSource[]>;
    listScreenShareAudioOutputs?: () => Promise<
      DesktopScreenShareAudioOutput[]
    >;
    selectScreenShareSource?: (sourceId: string) => Promise<boolean>;
  };
  call?: {
    setStatus?: (status: {
      inCall: boolean;
      speaking: boolean;
      iconDataUrl?: string;
    }) => Promise<void>;
  };
};

declare global {
  interface Window {
    tensaminDesktop?: ElectronDesktopApi;
  }
}

type DesktopMediaContextValue = {
  getScreenShareCapabilities: () => Promise<DesktopScreenShareCapabilities>;
  listScreenShareSources: () => Promise<DesktopScreenShareSource[]>;
  listScreenShareAudioOutputs: () => Promise<DesktopScreenShareAudioOutput[]>;
};

const defaultCapabilities: DesktopScreenShareCapabilities = {
  runtime: undefined,
  platform: "other",
  showAudioOutputSelector: false,
  showAudioSwitch: false,
  hasReliableSystemAudio: false,
};

const desktopMediaContext = createContext<DesktopMediaContextValue | undefined>(
  undefined,
);

async function listScreenShareSources(): Promise<DesktopScreenShareSource[]> {
  if (window.tensaminDesktop?.media?.listScreenShareSources) {
    return window.tensaminDesktop.media.listScreenShareSources();
  }

  return [];
}

async function listScreenShareAudioOutputs(): Promise<
  DesktopScreenShareAudioOutput[]
> {
  if (window.tensaminDesktop?.media?.listScreenShareAudioOutputs) {
    return window.tensaminDesktop.media.listScreenShareAudioOutputs();
  }

  return [];
}

async function getScreenShareCapabilities(): Promise<DesktopScreenShareCapabilities> {
  if (window.tensaminDesktop?.media?.getScreenShareCapabilities) {
    return window.tensaminDesktop.media.getScreenShareCapabilities();
  }

  return defaultCapabilities;
}

export function useDesktopMedia() {
  const value = useContext(desktopMediaContext);

  if (!value) {
    throw new Error("useDesktopMedia must be used within the desktop provider");
  }

  return value;
}

export default function DesktopMediaProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useMemo<DesktopMediaContextValue>(
    () => ({
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
