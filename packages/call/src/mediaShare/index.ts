import { BrowserMediaShareAdapter } from "./browser";
import { ElectronMediaShareAdapter } from "./electron";
import { TauriMediaShareAdapter } from "./tauri";
import type { MediaShareAdapter } from "./types";

let adapter: MediaShareAdapter | null = null;

export function getMediaShareAdapter(): MediaShareAdapter {
  if (!adapter) {
    adapter = window.tensaminMobileMedia
      ? new TauriMediaShareAdapter()
      : window.tensaminDesktop?.media
        ? new ElectronMediaShareAdapter()
        : new BrowserMediaShareAdapter();
  }

  return adapter;
}

export type {
  MediaShareAdapter,
  MediaShareKind,
  MediaShareRequest,
  MediaShareSession,
  MediaShareSource,
} from "./types";
