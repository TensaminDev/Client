import { listCameraSources, startCamera } from "./browser";
import type {
  MediaShareAdapter,
  MediaShareCapabilities,
  MediaShareKind,
  MediaShareRequest,
  MediaShareSession,
  MediaShareSource,
} from "./types";

declare global {
  interface Window {
    tensaminMobileMedia?: {
      startScreenShare: (includeAudio: boolean) => void;
      stopScreenShare: () => void;
      requestCameraPermission: () => void;
    };
  }
}

function eventDetail<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function requestCameraPermission() {
  const bridge = window.tensaminMobileMedia;
  if (!bridge) throw new Error("Tauri mobile media bridge is unavailable.");

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for camera permission."));
    }, 30_000);
    const onPermission = (event: Event) => {
      cleanup();
      const permission = eventDetail<{ camera: boolean }>(event);
      if (permission.camera) {
        resolve();
      } else {
        reject(new Error("Camera permission was denied."));
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener(
        "tensamin-mobile-camera-permission",
        onPermission,
      );
    };

    window.addEventListener("tensamin-mobile-camera-permission", onPermission);
    bridge.requestCameraPermission();
  });
}

async function startMobileScreen(
  includeAudio: boolean,
): Promise<MediaShareSession> {
  const bridge = window.tensaminMobileMedia;
  if (!bridge) throw new Error("Tauri mobile media bridge is unavailable.");

  return new Promise<MediaShareSession>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Unable to create the mobile capture canvas."));
      return;
    }

    const stream = canvas.captureStream(15);
    let audioContext: AudioContext | null = null;
    let audioNode: ScriptProcessorNode | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    const audioQueue: Float32Array[] = [];
    let audioQueueOffset = 0;
    let queuedAudioSamples = 0;
    let started = false;
    let resolved = false;
    let firstFrame = false;
    let lastError: Error | null = null;
    let errorTimer = 0;

    const timeout = window.setTimeout(() => {
      cleanup();
      bridge.stopScreenShare();
      reject(
        lastError ?? new Error("Timed out starting mobile screen sharing."),
      );
    }, 60_000);

    const complete = () => {
      if (!started || !firstFrame || resolved) return;
      resolved = true;
      window.clearTimeout(timeout);
      resolve({
        tracks: stream.getTracks(),
        stop: async () => {
          bridge.stopScreenShare();
          cleanup();
        },
      });
    };

    const onStarted = (event: Event) => {
      started = true;
      const detail = eventDetail<{ includeAudio: boolean }>(event);
      if (detail.includeAudio) {
        audioContext = new AudioContext({ sampleRate: 48_000 });
        audioNode = audioContext.createScriptProcessor(2048, 0, 1);
        audioDestination = audioContext.createMediaStreamDestination();
        audioNode.onaudioprocess = ({ outputBuffer }) => {
          const output = outputBuffer.getChannelData(0);
          output.fill(0);
          let outputOffset = 0;
          while (outputOffset < output.length && audioQueue.length > 0) {
            const chunk = audioQueue[0];
            const available = chunk.length - audioQueueOffset;
            const count = Math.min(available, output.length - outputOffset);
            output.set(
              chunk.subarray(audioQueueOffset, audioQueueOffset + count),
              outputOffset,
            );
            outputOffset += count;
            audioQueueOffset += count;
            queuedAudioSamples -= count;
            if (audioQueueOffset === chunk.length) {
              audioQueue.shift();
              audioQueueOffset = 0;
            }
          }
        };
        audioNode.connect(audioDestination);
        void audioContext.resume();
        for (const track of audioDestination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
      }
      complete();
    };

    const onFrame = (event: Event) => {
      const detail = eventDetail<{
        data: string;
        mimeType: string;
        width: number;
        height: number;
      }>(event);
      const image = new Image();
      image.onload = () => {
        if (canvas.width !== detail.width || canvas.height !== detail.height) {
          canvas.width = detail.width;
          canvas.height = detail.height;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        firstFrame = true;
        complete();
      };
      image.src = `data:${detail.mimeType};base64,${detail.data}`;
    };

    const onAudio = (event: Event) => {
      const bytes = decodeBase64(
        eventDetail<{
          data: string;
          sampleRate: number;
          channelCount: number;
          encoding: "pcm16le";
        }>(event).data,
      );
      const samples = new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2),
      );
      const chunk = new Float32Array(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        chunk[index] = samples[index] / 32768;
      }
      audioQueue.push(chunk);
      queuedAudioSamples += chunk.length;
      const maximumQueuedSamples = 48_000 * 2;
      while (queuedAudioSamples > maximumQueuedSamples && audioQueue.length) {
        const dropped = audioQueue.shift();
        if (!dropped) break;
        queuedAudioSamples -= dropped.length - audioQueueOffset;
        audioQueueOffset = 0;
      }
    };

    const onStopped = () => {
      cleanup();
      if (!resolved) reject(new Error("Mobile screen sharing was stopped."));
    };

    const onError = (event: Event) => {
      lastError = new Error(eventDetail<{ message: string }>(event).message);
      window.clearTimeout(errorTimer);
      errorTimer = window.setTimeout(() => {
        if (!started && !resolved) {
          cleanup();
          reject(lastError ?? new Error("Mobile screen sharing failed."));
        }
      }, 300);
    };

    const listeners: Array<[string, EventListener]> = [
      ["tensamin-mobile-screen-started", onStarted],
      ["tensamin-mobile-screen-frame", onFrame],
      ["tensamin-mobile-screen-audio", onAudio],
      ["tensamin-mobile-screen-stopped", onStopped],
      ["tensamin-mobile-screen-error", onError],
    ];
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearTimeout(errorTimer);
      listeners.forEach(([name, listener]) =>
        window.removeEventListener(name, listener),
      );
      stream.getTracks().forEach((track) => track.stop());
      audioNode?.disconnect();
      audioNode = null;
      void audioContext?.close();
      audioContext = null;
    };

    listeners.forEach(([name, listener]) =>
      window.addEventListener(name, listener),
    );
    bridge.startScreenShare(includeAudio);
  });
}

export class TauriMediaShareAdapter implements MediaShareAdapter {
  async getCapabilities(): Promise<MediaShareCapabilities> {
    return {
      runtime: "tauri",
      screenPicker: "system",
      canShareScreenAudio: true,
      canSelectScreenAudioOutput: false,
    };
  }

  async listSources(kind: MediaShareKind): Promise<MediaShareSource[]> {
    if (kind !== "camera") return [];
    await requestCameraPermission();
    return listCameraSources();
  }

  async start(request: MediaShareRequest): Promise<MediaShareSession> {
    if (request.kind === "screen") {
      return startMobileScreen(request.includeAudio ?? true);
    }

    await requestCameraPermission();
    return startCamera(request.sourceId);
  }
}
