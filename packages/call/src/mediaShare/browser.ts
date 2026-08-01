import type {
  MediaShareAdapter,
  MediaShareCapabilities,
  MediaShareKind,
  MediaShareRequest,
  MediaShareSession,
  MediaShareSource,
} from "./types";

export async function listCameraSources(): Promise<MediaShareSource[]> {
  const permissionStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } finally {
    permissionStream.getTracks().forEach((track) => track.stop());
  }
  let cameraIndex = 0;

  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device) => ({
      id: device.deviceId,
      kind: "camera" as const,
      name: device.label || `Camera ${++cameraIndex}`,
    }));
}

export async function startCamera(
  sourceId?: string,
): Promise<MediaShareSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: sourceId ? { deviceId: { exact: sourceId } } : true,
  });

  return streamSession(stream);
}

function streamSession(stream: MediaStream): MediaShareSession {
  return {
    tracks: stream.getTracks(),
    stop: async () => {
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

export class BrowserMediaShareAdapter implements MediaShareAdapter {
  async getCapabilities(): Promise<MediaShareCapabilities> {
    return {
      runtime: "browser",
      screenPicker: "native",
      canShareScreenAudio: true,
      canSelectScreenAudioOutput: false,
    };
  }

  async listSources(kind: MediaShareKind): Promise<MediaShareSource[]> {
    return kind === "camera" ? listCameraSources() : [];
  }

  async start(request: MediaShareRequest): Promise<MediaShareSession> {
    if (request.kind === "camera") {
      return startCamera(request.sourceId);
    }

    const options: DisplayMediaStreamOptions & {
      systemAudio: "include" | "exclude";
      surfaceSwitching: "include" | "exclude";
    } = {
      audio: request.includeAudio ?? true,
      video: true,
      systemAudio: request.includeAudio === false ? "exclude" : "include",
      surfaceSwitching: "include",
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(options);

    return streamSession(stream);
  }
}
