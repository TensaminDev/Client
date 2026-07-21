import { log } from "@tensamin/shared/log";
import type {} from "@tensamin/shared/desktopMedia";
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
          log(
            1,
            "call",
            "red",
            "Failed to unpublish screen share track",
            error,
          );
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

    if (window.tensaminDesktop?.media?.selectScreenShareSource) {
      await window.tensaminDesktop.media.selectScreenShareSource(sourceId);
      const tracks = await room.localParticipant.createScreenTracks({
        audio: false,
        video: true,
        systemAudio: "exclude",
        surfaceSwitching: "exclude",
        selfBrowserSurface: "exclude",
        contentHint: "detail",
      });

      await publishScreenShareTracks(tracks, () => {
        tracks.forEach((track) => track.stop());
      });
      return;
    }

    throw new Error(
      `Electron desktop media bridge is unavailable. Cannot capture ${sourceId}.`,
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
