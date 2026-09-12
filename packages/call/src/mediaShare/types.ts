export type MediaShareKind = "screen" | "camera";

export type MediaShareSource = {
  id: string;
  kind: "screen" | "window" | "camera";
  name: string;
  subtitle?: string | null;
  thumbnail?: string | null;
};

export type MediaShareCapabilities = {
  runtime: "browser" | "electron" | "tauri";
  screenPicker: "native" | "sources" | "system";
  canShareScreenAudio: boolean;
  canSelectScreenAudioOutput: boolean;
};

export type MediaShareRequest = {
  kind: MediaShareKind;
  sourceId?: string;
  includeAudio?: boolean;
  resolution?: number;
  frameRate?: number;
  codec?: "auto" | "vp8" | "vp9" | "h264" | "av1" | "h265";
};

export type MediaShareSession = {
  tracks: MediaStreamTrack[];
  stop: () => Promise<void>;
};

export interface MediaShareAdapter {
  getCapabilities(): Promise<MediaShareCapabilities>;
  listSources(kind: MediaShareKind): Promise<MediaShareSource[]>;
  start(request: MediaShareRequest): Promise<MediaShareSession>;
}
