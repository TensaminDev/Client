import { log } from "@tensamin/shared/log";
import { type LocalTrack, Room, Track } from "livekit-client";
import {
  getMediaShareAdapter,
  type MediaShareKind,
  type MediaShareRequest,
  type MediaShareSession,
} from ".";

export type LocalMediaShareSession = {
  tracks: Array<LocalTrack | MediaStreamTrack>;
  capture: MediaShareSession;
};

type MediaShareStoreState = {
  screenShareSession: LocalMediaShareSession | null;
  cameraSession: LocalMediaShareSession | null;
};

export function createMediaShareController({
  room,
  getState,
  setState,
  getLocalParticipantId,
  startWatching,
  stopWatching,
  syncParticipantState,
}: {
  room: Room;
  getState: () => MediaShareStoreState;
  setState: (
    updater:
      | Partial<MediaShareStoreState>
      | ((state: MediaShareStoreState) => Partial<MediaShareStoreState>),
  ) => void;
  getLocalParticipantId: () => number | null;
  startWatching: (participantId: number) => void;
  stopWatching: (participantId: number) => void;
  syncParticipantState: () => void;
}) {
  function getSession(kind: MediaShareKind) {
    return kind === "screen"
      ? getState().screenShareSession
      : getState().cameraSession;
  }

  function setSession(
    kind: MediaShareKind,
    session: LocalMediaShareSession | null,
  ) {
    setState(
      kind === "screen"
        ? { screenShareSession: session }
        : { cameraSession: session },
    );
  }

  async function clearPublishedShare(kind: MediaShareKind) {
    const session = getSession(kind);
    if (!session) return;

    setSession(kind, null);
    await Promise.all(
      session.tracks.map((track) =>
        room.localParticipant.unpublishTrack(track, true).catch((error) => {
          log(1, "call", "red", `Failed to unpublish ${kind} track`, error);
        }),
      ),
    );
    await session.capture.stop().catch((error) => {
      log(1, "call", "red", `Failed to stop ${kind} capture`, error);
    });

    if (kind === "screen") {
      const localParticipantId = getLocalParticipantId();
      if (localParticipantId != null) stopWatching(localParticipantId);
    }
  }

  async function publishShare(
    kind: MediaShareKind,
    capture: MediaShareSession,
  ) {
    if (capture.tracks.length === 0) {
      await capture.stop();
      throw new Error(`No ${kind} tracks were created.`);
    }

    const published: MediaStreamTrack[] = [];
    try {
      for (const track of capture.tracks) {
        await room.localParticipant.publishTrack(track, {
          source:
            track.kind === Track.Kind.Audio
              ? Track.Source.ScreenShareAudio
              : kind === "screen"
                ? Track.Source.ScreenShare
                : Track.Source.Camera,
        });
        published.push(track);
      }
    } catch (error) {
      await Promise.all(
        published.map((track) =>
          room.localParticipant.unpublishTrack(track, true),
        ),
      );
      await capture.stop();
      throw error;
    }

    for (const track of capture.tracks) {
      track.addEventListener(
        "ended",
        () => {
          void stop(kind);
        },
        { once: true },
      );
    }

    setSession(kind, { tracks: capture.tracks, capture });
    syncParticipantState();

    if (kind === "screen") {
      const localParticipantId = getLocalParticipantId();
      if (localParticipantId != null) startWatching(localParticipantId);
    }
  }

  async function start(request: MediaShareRequest) {
    await clearPublishedShare(request.kind);
    const capture = await getMediaShareAdapter().start(request);
    await publishShare(request.kind, capture);
  }

  async function stop(kind: MediaShareKind) {
    await clearPublishedShare(kind);
    syncParticipantState();
  }

  async function clearAll() {
    await Promise.all([
      clearPublishedShare("screen"),
      clearPublishedShare("camera"),
    ]);
  }

  return { clearAll, start, stop };
}
