import { useCallback, useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useTTP } from "@tensamin/ttp";
import { log, toast } from "@tensamin/shared/log";
import { ttp } from "@tensamin/shared/data";
import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";
import { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";
import {
  ExternalE2EEKeyProvider,
  LocalAudioTrack,
  type LocalTrack,
  Room,
  RoomEvent,
  type RemoteTrack,
  type ScreenShareCaptureOptions,
  Track,
  setLogExtension,
  getLogger,
} from "livekit-client";
import z from "zod";
import { toast as sonnerToast } from "sonner";

// logging
setLogExtension(
  (level, message, context) =>
    context
      ? log(level, "livekit", "blue", message, context)
      : log(level, "livekit", "blue", message),
  getLogger("tensamin"),
);

type CallState = "closed" | "closing" | "connecting" | "open" | "encrypting";
type CallView = "preview" | "focused" | "grid";
type CurrentCallData =
  | (z.infer<typeof ttp.call_data.response> & { exists: boolean })
  | null;

type NavigateFn = (options: {
  to: string;
  search?: Record<string, unknown>;
}) => Promise<void>;
type SendFn = (
  type: string,
  data: Record<string, unknown>,
) => Promise<{ data: unknown }>;
type GetSharedSecretFn = (
  privateKey: unknown,
  ownPublicKey: string,
  remotePublicKey: string,
) => Promise<string>;
type DecryptTextFn = (sharedSecret: string, text: string) => Promise<string>;
type LoadFn = (key: string) => Promise<unknown>;
type GetUserFn = (userId: number) => Promise<{ public_key: string }>;

type Runtime = {
  navigate: NavigateFn;
  send: SendFn;
  getSharedSecret: GetSharedSecretFn;
  decryptText: DecryptTextFn;
  load: LoadFn;
  getUser: GetUserFn;
};

type ScreenShareSession = {
  tracks: Array<LocalTrack | MediaStreamTrack>;
  cleanup?: () => void;
};

type CallStore = {
  state: CallState;
  view: CallView;
  invitedUserId: number | null;
  callId: string | null;
  callSecret: string | null;
  livekitToken: string | null;
  currentCallData: CurrentCallData;
  deaf: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
  screenShareSession: ScreenShareSession | null;
  isEncrypted: boolean;
  room: Room;
  keyProvider: ExternalE2EEKeyProvider;
  e2eeWorker: Worker;
  runtime: Runtime | null;
};

const keyProvider = new ExternalE2EEKeyProvider();
const e2eeWorker = new Worker(
  new URL("livekit-client/e2ee-worker", import.meta.url),
);
const room = new Room({
  dynacast: true,
  adaptiveStream: true,
  loggerName: "tensamin",
  encryption: {
    keyProvider,
    worker: e2eeWorker,
  },
});
const remoteAudioElements = new Map<string, HTMLMediaElement>();

// audio helpers
function attachRemoteAudio(trackSid: string, element: HTMLMediaElement) {
  const existingElement = remoteAudioElements.get(trackSid);

  if (existingElement) {
    existingElement.remove();
  }

  element.autoplay = true;
  element.style.display = "none";
  document.body.appendChild(element);
  remoteAudioElements.set(trackSid, element);
}

function detachRemoteAudio(trackSid: string) {
  const element = remoteAudioElements.get(trackSid);

  if (!element) {
    return;
  }

  element.remove();
  remoteAudioElements.delete(trackSid);
}

function clearRemoteAudio() {
  for (const trackSid of remoteAudioElements.keys()) {
    detachRemoteAudio(trackSid);
  }
}

// utils
function requireRuntime(runtime: Runtime | null): Runtime {
  if (!runtime) {
    throw new Error("Call store is not initialized");
  }

  return runtime;
}

export function syncParticipantState() {
  const { room, screenShareSession } = useCall.getState();

  useCall.setState({
    micEnabled: room.localParticipant.isMicrophoneEnabled,
    screenShareEnabled:
      screenShareSession != null || room.localParticipant.isScreenShareEnabled,
    isEncrypted:
      room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted,
  });
}

// set state functions
export function setCallRuntime(runtime: Runtime) {
  useCall.setState({ runtime });
}

export function setCallState(state: CallState) {
  useCall.setState({ state });
}

export function setCallView(view: CallView) {
  useCall.setState({ view });
}

export function setCallId(callId: string | null) {
  useCall.setState({ callId });
}

export function setCurrentCallData(
  currentCallData: CurrentCallData & { exists: boolean },
) {
  useCall.setState({ currentCallData });
}

// more utils
export async function openCallPage(callId: string) {
  await requireRuntime(useCall.getState().runtime).navigate({
    to: "/call",
    search: { id: callId },
  });
}

export async function getCallToken(callId: string): Promise<string> {
  const response = await requireRuntime(useCall.getState().runtime)
    .send("call_token", {
      call_id: callId,
    })
    .catch((err) => {
      log(1, "call", "red", "Failed to get call secret", err);
      throw err;
    });

  const data = response.data as { call_token: string };
  return data.call_token;
}

export async function connect(callId: string) {
  const token = await getCallToken(callId);

  useCall.setState({
    state: "connecting",
    callId,
    livekitToken: token,
  });

  log(2, "call", "purple", "Connecting to call", {
    callId,
    callSecret: useCall.getState().callSecret,
  });

  await room.connect("wss://call.tensamin.net", token).catch((error) => {
    useCall.setState({ state: "closed", livekitToken: null });
    log(1, "call", "red", "Failed to connect to room", error);
    toast(
      "error",
      error instanceof Error ? error.message : "Failed to connect to call.",
    );
    throw error;
  });

  await room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
    log(1, "call", "red", "Failed to enable microphone", error);
    toast("error", "Failed to enable microphone.");
    throw error;
  });

  syncParticipantState();
}

export function disconnect() {
  void clearPublishedScreenShare();

  useCall.setState({
    state: "closing",
    invitedUserId: null,
    callId: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    view: "preview",
    screenShareSession: null,
  });

  room.remoteParticipants.forEach((participant) => {
    participant.setVolume(100);
  });

  room.disconnect();
  useCall.setState({ state: "closed" });
  syncParticipantState();
}

export async function joinCall(
  userId: number,
  callSecret?: string,
  existingCallId?: string,
  sendInvite = true,
) {
  const runtime = requireRuntime(useCall.getState().runtime);

  log(2, "call", "purple", "Call creation initialised");
  useCall.setState({
    state: "encrypting",
    invitedUserId: sendInvite ? userId : null,
  });

  if (callSecret) {
    try {
      const sharedSecret = await runtime.getSharedSecret(
        await runtime.load("private_key"),
        await runtime
          .getUser((await runtime.load("user_id")) as number)
          .then((res) => res.public_key),
        await runtime.getUser(userId).then((res) => res.public_key),
      );
      const decryptedSecret = await runtime.decryptText(
        sharedSecret,
        callSecret,
      );

      await keyProvider.setKey(decryptedSecret);
      await room.setE2EEEnabled(true);
      useCall.setState({ callSecret: decryptedSecret });
    } catch (err) {
      log(1, "call", "red", "Failed getting call secret", err);
      disconnect();
      return;
    }
  } else {
    const random = crypto.randomUUID();

    await keyProvider.setKey(random);
    await room.setE2EEEnabled(true);
    useCall.setState({ callSecret: random });
  }

  const finalId = existingCallId || crypto.randomUUID();

  try {
    useCall.setState({ view: "grid", callId: finalId });
    await openCallPage(finalId);
    await connect(finalId);
  } catch (err) {
    log(1, "call", "red", "Failed to join call [navbar level]", err);
  }
}

export function toggleDeaf() {
  const nextDeaf = !useCall.getState().deaf;

  room.remoteParticipants.forEach((participant) => {
    participant.setVolume(nextDeaf ? 0 : 100);
  });

  if (nextDeaf && room.localParticipant.isMicrophoneEnabled) {
    toggleMute();
  }

  useCall.setState({ deaf: nextDeaf });
}

export async function toggleMute() {
  const micEnabled = useCall.getState().micEnabled;

  if (!micEnabled && useCall.getState().deaf) {
    toggleDeaf();
  }

  await room.localParticipant.setMicrophoneEnabled(!micEnabled);
  syncParticipantState();
}

async function clearPublishedScreenShare() {
  const screenShareSession = useCall.getState().screenShareSession;

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

  useCall.setState({ screenShareSession: null });
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

  useCall.setState({ screenShareSession: { tracks, cleanup } });
  syncParticipantState();
}

export async function startScreenShare(options?: ScreenShareCaptureOptions) {
  await clearPublishedScreenShare();

  const tracks = await room.localParticipant.createScreenTracks(options);

  await publishScreenShareTracks(
    tracks,
    () => tracks.forEach((track) => track.stop()),
  );
}

export async function startLinuxDesktopScreenShare(sourceId: string) {
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
        image.onerror = () => reject(new Error("Failed to decode screen share frame."));
        image.src = dataUrl;
      });

      if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
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
      log(1, "call", "red", "Failed to capture Linux screen share frame", error);
    });
  }, 125);

  await publishScreenShareTracks([videoTrack], () => {
    stopped = true;
    window.clearInterval(interval);
    stream.getTracks().forEach((track) => track.stop());
    canvas.remove();
  });
}

export async function stopScreenShare() {
  await clearPublishedScreenShare();
  syncParticipantState();
}

export async function setScreenShareEnabled(
  enabled: boolean,
  options?: ScreenShareCaptureOptions,
) {
  if (enabled) {
    await startScreenShare(options);
    return;
  }

  await stopScreenShare();
}

export function resetCallState() {
  useCall.setState({
    state: "closed",
    view: "preview",
    invitedUserId: null,
    callId: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    screenShareSession: null,
  });

  syncParticipantState();
}

async function ensureNoiseFilter(
  noiseFilter: DeepFilterNoiseFilterProcessor,
): Promise<void> {
  const microphoneTrack = room.localParticipant.getTrackPublication(
    Track.Source.Microphone,
  )?.track;

  if (
    !(microphoneTrack instanceof LocalAudioTrack) ||
    microphoneTrack.getProcessor()
  ) {
    return;
  }

  await microphoneTrack.setProcessor(noiseFilter).catch((err) => {
    log(1, "call", "red", "Failed to enable noise filter", err);
  });
}

export const useCall = create<CallStore>(() => ({
  state: "closed",
  view: "preview",
  invitedUserId: null,
  callId: null,
  callSecret: null,
  livekitToken: null,
  currentCallData: null,
  deaf: false,
  micEnabled: room.localParticipant.isMicrophoneEnabled,
  screenShareEnabled: room.localParticipant.isScreenShareEnabled,
  screenShareSession: null,
  isEncrypted:
    room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted,
  room,
  keyProvider,
  e2eeWorker,
  runtime: null,
}));

export function useInitializeCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const { send, subscribePush } = useTTP();
  const { getSharedSecret, decryptText, encryptText } = useCrypto();
  const { load } = useStorage();
  const { get } = useUser();

  const callId = useCall((state) => state.callId);
  const view = useCall((state) => state.view);

  const listenersRegistered = useRef(false);
  const noiseFilter = useMemo(
    () =>
      new DeepFilterNoiseFilterProcessor({
        enabled: true,
        enableNoiseReduction: true,
        noiseReductionLevel: 80,
        sampleRate: 48000,
        assetConfig: {
          cdnUrl: "/assets",
        },
      }),
    [],
  );

  useEffect(() => {
    setCallRuntime({
      navigate,
      send: send as SendFn,
      getSharedSecret: getSharedSecret as GetSharedSecretFn,
      decryptText: decryptText as DecryptTextFn,
      load: load as LoadFn,
      getUser: get as GetUserFn,
    });
  }, [decryptText, get, getSharedSecret, load, navigate, send]);

  const showCallingScreen = useCallback(
    async (callId: string, callSecret: string, senderId: number) => {
      const senderName = await get(senderId).then((data) => data.display);

      sonnerToast(`Incoming call from ${senderName}`, {
        action: {
          label: "Accept",
          onClick: () => {
            joinCall(senderId, callSecret, callId, false).catch((err) => {
              log(1, "call", "red", "Failed to join call", err);
            });
          },
        },
        cancel: {
          label: "Decline",
          onClick: () => {
            log(2, "call", "purple", "Declined call invite", {
              callId,
              senderId,
            });
          },
        },
      });
    },
    [get],
  );

  // listen to call invites
  useEffect(() => {
    subscribePush(async (message) => {
      if (message.type !== "call_invite") return;

      const { call_id, call_secret, sender_id } = message.data as {
        call_id: string;
        call_secret: string;
        sender_id: number;
      };

      showCallingScreen(call_id, call_secret, sender_id);
    });
  }, [subscribePush, showCallingScreen]);

  // get callId from url
  useEffect(() => {
    if (!location.pathname.startsWith("/call")) {
      return;
    }

    const search = new URLSearchParams(location.searchStr);
    const routeCallId = search.get("id");

    if (routeCallId) {
      setCallId(routeCallId);
    }
  }, [location.pathname, location.searchStr]);

  // room setup
  useEffect(() => {
    if (listenersRegistered.current) {
      return;
    }

    listenersRegistered.current = true;

    const onConnected = () => {
      useCall.setState({ state: "open" });
      syncParticipantState();

      const invitedUserId = useCall.getState().invitedUserId;

      if (invitedUserId != null) {
        setTimeout(async () => {
          void requireRuntime(useCall.getState().runtime)
            .send("call_invite", {
              receiver_id: invitedUserId,
              call_id: useCall.getState().callId!,
              call_secret: await encryptText(
                await getSharedSecret(
                  await load("private_key"),
                  await get(await load("user_id")).then(
                    (data) => data.public_key,
                  ),
                  await get(invitedUserId).then((data) => data.public_key),
                ),
                useCall.getState().callSecret!,
              ),
            })
            .catch((error) => {
              toast("error", "Failed to send call invite.");
              log(1, "call", "red", "Failed to send call invite", error);
            });
        }, 1000);
      }

      log(2, "call", "purple", "Connected to call", {
        callId: useCall.getState().callId,
        callSecret: useCall.getState().callSecret,
      });
    };

    const onDisconnected = () => {
      useCall.setState({ state: "closed" });
      syncParticipantState();
      log(2, "call", "purple", "Disconnected from call", {
        callId: useCall.getState().callId,
        callSecret: useCall.getState().callSecret,
      });
    };

    const onMediaDeviceFailure = (error: Error, kind?: MediaDeviceKind) => {
      log(1, "call", "red", "Media device failure", { error, kind });
      toast("error", "Media device failure. See console for details.");
    };

    const onEncryptionError = (error: Error) => {
      log(1, "call", "red", "Encryption error", { error });
      toast("error", "Error during call encryption. See console for details.");
    };

    const onParticipantStateChange = () => {
      syncParticipantState();
      void ensureNoiseFilter(noiseFilter);
    };

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind !== "audio" || !track.sid) {
        return;
      }

      attachRemoteAudio(track.sid, track.attach());
    };

    const onTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind !== "audio" || !track.sid) {
        return;
      }

      track.detach();
      detachRemoteAudio(track.sid);
    };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted, onParticipantStateChange);
    room.on(RoomEvent.TrackUnmuted, onParticipantStateChange);
    room.on(RoomEvent.LocalTrackPublished, onParticipantStateChange);
    room.on(RoomEvent.LocalTrackUnpublished, onParticipantStateChange);
    room.on(RoomEvent.MediaDevicesError, onMediaDeviceFailure);
    room.on(RoomEvent.EncryptionError, onEncryptionError);
    room.on(RoomEvent.ConnectionStateChanged, onParticipantStateChange);

    void ensureNoiseFilter(noiseFilter);
    syncParticipantState();

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Reconnected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted, onParticipantStateChange);
      room.off(RoomEvent.TrackUnmuted, onParticipantStateChange);
      room.off(RoomEvent.LocalTrackPublished, onParticipantStateChange);
      room.off(RoomEvent.LocalTrackUnpublished, onParticipantStateChange);
      room.off(RoomEvent.MediaDevicesError, onMediaDeviceFailure);
      room.off(RoomEvent.EncryptionError, onEncryptionError);
      room.off(RoomEvent.ConnectionStateChanged, onParticipantStateChange);
      clearRemoteAudio();
      listenersRegistered.current = false;
      room.disconnect();
      e2eeWorker.terminate();
    };
  }, [noiseFilter, encryptText, get, getSharedSecret, load]);

  // fetch call data for preview page
  useEffect(() => {
    if (view !== "preview" || !callId) {
      return;
    }

    send("call_data", { call_id: callId })
      .then((data) => {
        setCurrentCallData({
          ...(data.data as z.infer<typeof ttp.call_data.response>),
          exists: true,
        });
      })
      .catch((err) => {
        log(1, "call", "red", "Failed to get call data", {
          callId,
          error: err,
        });
        setCurrentCallData({
          user_ids: [],
          exists: false,
        });
      });
  }, [callId, send, view]);
}
