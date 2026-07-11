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
  runtime: "electron";
  platform: "linux" | "macos" | "windows" | "other";
  showAudioOutputSelector: boolean;
  showAudioSwitch: boolean;
  hasReliableSystemAudio: boolean;
};

export type DesktopCallStatus = {
  inCall: boolean;
  speaking: boolean;
  iconDataUrl?: string;
};

export type DesktopSecureStorageStatus = {
  available: boolean;
  backend: string | null;
};

export const secureStorageLimits = {
  maxKeyBytes: 256,
  maxValueBytes: 1024 * 1024,
} as const;

export type ReleaseArtifact = {
  name: string;
  platform: string;
  arch: string;
  url: string;
  sha256: string;
  size: number;
};

export type ReleaseMetadata = {
  version: string;
  tag: string;
  publishedAt: string;
  artifacts: ReleaseArtifact[];
};

export type UpdateCheckResult =
  | { available: false; currentVersion: string; latestVersion: string }
  | {
      available: true;
      currentVersion: string;
      latestVersion: string;
      artifact: ReleaseArtifact;
    };

export const ipcChannels = {
  listScreenShareSources: "desktopMedia:listScreenShareSources",
  listScreenShareAudioOutputs: "desktopMedia:listScreenShareAudioOutputs",
  getScreenShareCapabilities: "desktopMedia:getScreenShareCapabilities",
  selectScreenShareSource: "desktopMedia:selectScreenShareSource",
  minimizeWindow: "window:minimize",
  maximizeWindow: "window:maximize",
  closeWindow: "window:close",
  getVersion: "app:getVersion",
  checkForUpdates: "updates:checkForUpdates",
  setCallStatus: "call:setStatus",
  getSecureStorageStatus: "secureStorage:getStatus",
  loadSecureStorage: "secureStorage:load",
  saveSecureStorage: "secureStorage:save",
  deleteSecureStorage: "secureStorage:delete",
  clearSecureStorage: "secureStorage:clear",
} as const;
