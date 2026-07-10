import { contextBridge, ipcRenderer } from "electron";
import {
  ipcChannels,
  type DesktopCallStatus,
  type DesktopScreenShareSource,
} from "../shared/ipc.js";

function windowAction(channel: string) {
  return () => ipcRenderer.invoke(channel);
}

const desktopApi = {
  media: {
    listScreenShareSources: () =>
      ipcRenderer.invoke(ipcChannels.listScreenShareSources),
    listScreenShareAudioOutputs: () =>
      ipcRenderer.invoke(ipcChannels.listScreenShareAudioOutputs),
    getScreenShareCapabilities: () =>
      ipcRenderer.invoke(ipcChannels.getScreenShareCapabilities),
    selectScreenShareSource: (sourceId: DesktopScreenShareSource["id"]) => {
      if (typeof sourceId !== "string" || sourceId.length === 0) {
        return Promise.reject(new Error("Invalid screen share source id."));
      }

      return ipcRenderer.invoke(ipcChannels.selectScreenShareSource, sourceId);
    },
  },
  app: {
    getVersion: () => ipcRenderer.invoke(ipcChannels.getVersion),
  },
  updates: {
    checkForUpdates: () => ipcRenderer.invoke(ipcChannels.checkForUpdates),
  },
  call: {
    setStatus: (status: DesktopCallStatus) => {
      if (
        typeof status?.inCall !== "boolean" ||
        typeof status?.speaking !== "boolean" ||
        (status.iconDataUrl !== undefined &&
          (typeof status.iconDataUrl !== "string" ||
            !status.iconDataUrl.startsWith("data:image/png;base64,")))
      ) {
        return Promise.reject(new Error("Invalid call status."));
      }

      return ipcRenderer.invoke(ipcChannels.setCallStatus, status);
    },
  },
  window: {
    minimize: () => windowAction(ipcChannels.minimizeWindow),
    maximize: () => windowAction(ipcChannels.maximizeWindow),
    close: () => windowAction(ipcChannels.closeWindow),
  },
};

contextBridge.exposeInMainWorld("tensaminDesktop", desktopApi);
contextBridge.exposeInMainWorld(
  "tensaminShowWindowControls",
  process.env.TENSAMIN_HIDE_CONTROLS == null,
);

export type TensaminDesktopApi = typeof desktopApi;
