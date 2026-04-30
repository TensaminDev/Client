import { invoke } from "@tauri-apps/api/core";
import { log } from "@tensamin/shared/log";
import {
  type LocalTrack,
  Room,
  type ScreenShareCaptureOptions,
  Track,
} from "livekit-client";

export type ScreenShareSession = {
  tracks: Array<LocalTrack | MediaStreamTrack>;
  cleanup?: () => void;
};

type ScreenShareStoreState = {
  screenShareSession: ScreenShareSession | null;
};

type ScreenShareStoreSetState = (
  updater:
    | Partial<ScreenShareStoreState>
    | ((state: ScreenShareStoreState) => Partial<ScreenShareStoreState>),
) => void;

type ScreenShareControllerOptions = {
  room: Room;
  getState: () => ScreenShareStoreState;
  setState: ScreenShareStoreSetState;
  getLocalParticipantId: () => number | null;
  startWatching: (participantId: number, options?: { focus?: boolean }) => void;
  stopWatching: (participantId: number) => void;
  syncParticipantState: () => void;
};

export function createScreenShareController({
  room,
  getState,
  setState,
  getLocalParticipantId,
  startWatching,
  stopWatching,
  syncParticipantState,
}: ScreenShareControllerOptions) {
  async function clearPublishedScreenShare() {
    const screenShareSession = getState().screenShareSession;

    if (!screenShareSession) {
      return;
    }

    await Promise.all(
      screenShareSession.tracks.map((track) =>
        room.localParticipant.unpublishTrack(track, true).catch((error) => {
          log(1, "call", "red", "Failed to unpublish screen share track", error);
        }),
      ),
    );

    screenShareSession.cleanup?.();

    const localParticipantId = getLocalParticipantId();

    if (localParticipantId != null) {
      stopWatching(localParticipantId);
    }

    setState({ screenShareSession: null });
  }

  async function publishScreenShareTracks(
    tracks: Array<LocalTrack | MediaStreamTrack>,
    cleanup?: () => void,
  ) {
    if (tracks.length === 0) {
      throw new Error("No screen share tracks were created.");
    }

    await Promise.all(
      tracks.map((track) =>
        room.localParticipant.publishTrack(track, {
          source:
            track.kind === Track.Kind.Video
              ? Track.Source.ScreenShare
              : Track.Source.ScreenShareAudio,
        }),
      ),
    );

    for (const track of tracks) {
      const mediaStreamTrack =
        track instanceof MediaStreamTrack ? track : track.mediaStreamTrack;

      mediaStreamTrack.addEventListener(
        "ended",
        () => {
          void stopScreenShare();
        },
        { once: true },
      );
    }

    setState({ screenShareSession: { tracks, cleanup } });
    syncParticipantState();

    const localParticipantId = getLocalParticipantId();

    if (localParticipantId != null) {
      startWatching(localParticipantId, { focus: true });
    }
  }

  async function startScreenShare(options?: ScreenShareCaptureOptions) {
    await clearPublishedScreenShare();

    const tracks = await room.localParticipant.createScreenTracks(options);

    await publishScreenShareTracks(tracks, () => {
      tracks.forEach((track) => track.stop());
    });
  }

  async function startLinuxDesktopScreenShare(sourceId: string) {
    await clearPublishedScreenShare();

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    canvas.style.display = "none";
    document.body.appendChild(canvas);

    const context = canvas.getContext("2d");

    if (!context) {
      canvas.remove();
      throw new Error("Failed to initialize the screen share canvas.");
    }

    const stream = canvas.captureStream(8);
    const videoTrack = stream.getVideoTracks()[0];

    if (!videoTrack) {
      canvas.remove();
      throw new Error("Failed to create a video track for screen sharing.");
    }

    const image = new Image();
    let stopped = false;
    let frameRequestInFlight = false;

    const renderFrame = async () => {
      if (stopped || frameRequestInFlight) {
        return;
      }

      frameRequestInFlight = true;

      try {
        const dataUrl = await invoke<string>("capture_screen_share_frame", {
          sourceId,
        });

        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode screen share frame."));
          image.src = dataUrl;
        });

        if (
          canvas.width !== image.naturalWidth ||
          canvas.height !== image.naturalHeight
        ) {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } finally {
        frameRequestInFlight = false;
      }
    };

    await renderFrame();

    const interval = window.setInterval(() => {
      void renderFrame().catch((error) => {
        log(
          1,
          "call",
          "red",
          "Failed to capture Linux screen share frame",
          error,
        );
      });
    }, 125);

    await publishScreenShareTracks(
      [videoTrack],
      () => {
        stopped = true;
        window.clearInterval(interval);
        stream.getTracks().forEach((track) => track.stop());
        canvas.remove();
      },
    );
  }

  async function stopScreenShare() {
    await clearPublishedScreenShare();
    syncParticipantState();
  }

  async function setScreenShareEnabled(
    enabled: boolean,
    options?: ScreenShareCaptureOptions,
  ) {
    if (enabled) {
      await startScreenShare(options);
      return;
    }

    await stopScreenShare();
  }

  return {
    clearPublishedScreenShare,
    startLinuxDesktopScreenShare,
    startScreenShare,
    stopScreenShare,
    setScreenShareEnabled,
  };
}
