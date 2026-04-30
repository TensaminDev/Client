import { useCallback, useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useLocation, useNavigate } from "@tanstack/react-router";
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
  type Participant,
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
import {
  createScreenShareController,
  type ScreenShareSession,
} from "./screenshare";

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
type EncryptTextFn = (sharedSecret: string, text: string) => Promise<string>;
type LoadFn = (key: string) => Promise<unknown>;
type GetUserFn = (userId: number) => Promise<{ public_key: string }>;

type Runtime = {
  navigate: NavigateFn;
  send: SendFn;
  getSharedSecret: GetSharedSecretFn;
  decryptText: DecryptTextFn;
  encryptText: EncryptTextFn;
  load: LoadFn;
  getUser: GetUserFn;
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
  focusedParticipantId: number | null;
  watchedStreamParticipantIds: number[];
  pendingWatchedParticipantIds: number[];
  activeScreenShareParticipantIds: number[];
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

function getParticipantId(identity: string | undefined): number | null {
  if (!identity) {
    return null;
  }

  const parsed = Number(identity);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAllParticipants(): Participant[] {
  return [...room.remoteParticipants.values(), room.localParticipant];
}

function getActiveScreenShareParticipantIds(): number[] {
  return getAllParticipants()
    .map((participant) => ({
      participantId: getParticipantId(participant.identity),
      hasScreenShare:
        participant.getTrackPublication(Track.Source.ScreenShare) != null,
    }))
    .filter(
      (entry): entry is { participantId: number; hasScreenShare: true } =>
        entry.participantId != null && entry.hasScreenShare,
    )
    .map((entry) => entry.participantId);
}

function getScreenShareTrackForParticipant(participantId: number) {
  return getAllParticipants()
    .find(
      (participant) => getParticipantId(participant.identity) === participantId,
    )
    ?.getTrackPublication(Track.Source.ScreenShare)?.track;
}

function hasParticipant(participantId: number) {
  return getAllParticipants().some(
    (participant) => getParticipantId(participant.identity) === participantId,
  );
}

function syncScreenShareParticipants() {
  const activeScreenShareParticipantIds = getActiveScreenShareParticipantIds();
  const state = useCall.getState();
  const watchedStreamParticipantIds = state.watchedStreamParticipantIds.filter(
    (participantId) => activeScreenShareParticipantIds.includes(participantId),
  );
  const pendingWatchedParticipantIds = watchedStreamParticipantIds.filter(
    (participantId) => getScreenShareTrackForParticipant(participantId) == null,
  );
  const focusedParticipantId =
    state.focusedParticipantId != null &&
    (watchedStreamParticipantIds.includes(state.focusedParticipantId) ||
      hasParticipant(state.focusedParticipantId))
      ? state.focusedParticipantId
      : null;

  useCall.setState({
    activeScreenShareParticipantIds,
    watchedStreamParticipantIds,
    pendingWatchedParticipantIds,
    focusedParticipantId,
    view:
      state.view === "focused" && focusedParticipantId == null
        ? "grid"
        : state.view,
  });
}

// utils
function requireRuntime(runtime: Runtime | null): Runtime {
  if (!runtime) {
    throw new Error("Call store is not initialized");
  }

  return runtime;
}

// Sync local participant flags and screen-share derived state for the active call UI.
export function syncParticipantState() {
  const { room, screenShareSession } = useCall.getState();

  useCall.setState({
    micEnabled: room.localParticipant.isMicrophoneEnabled,
    screenShareEnabled:
      screenShareSession != null || room.localParticipant.isScreenShareEnabled,
    isEncrypted:
      room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted,
  });

  syncScreenShareParticipants();
}

// set state functions
// Store runtime dependencies from hooks so the call store can use them outside React.
export function setCallRuntime(runtime: Runtime) {
  useCall.setState({ runtime });
}

// Switch between preview, grid, and focused call layouts.
export function setCallView(view: CallView) {
  useCall.setState({ view });
}

// Keep the current call id in sync with navigation and connection flow.
export function setCallId(callId: string | null) {
  useCall.setState({ callId });
}

// Cache server call metadata used by the preview screen.
export function setCurrentCallData(
  currentCallData: CurrentCallData & { exists: boolean },
) {
  useCall.setState({ currentCallData });
}

// more utils
// Navigate the app into the dedicated call route for an active call.
export async function openCallPage(callId: string) {
  await requireRuntime(useCall.getState().runtime).navigate({
    to: "/call",
    search: { id: callId },
  });
}

// Request the LiveKit token that authorizes this client to join a call.
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

// Encrypt the active call secret for a recipient and send the call invite.
export async function sendCallInvite(userId: number) {
  const runtime = requireRuntime(useCall.getState().runtime);
  const { callId, callSecret } = useCall.getState();

  if (!callId || !callSecret) {
    throw new Error("Cannot send call invite without an active call.");
  }

  const ownUserId = (await runtime.load("user_id")) as number;
  const privateKey = await runtime.load("private_key");
  const ownPublicKey = await runtime.getUser(ownUserId).then(
    (data) => data.public_key,
  );
  const remotePublicKey = await runtime.getUser(userId).then(
    (data) => data.public_key,
  );
  const sharedSecret = await runtime.getSharedSecret(
    privateKey,
    ownPublicKey,
    remotePublicKey,
  );
  const encryptedCallSecret = await runtime.encryptText(sharedSecret, callSecret);

  await runtime.send("call_invite", {
    receiver_id: userId,
    call_id: callId,
    call_secret: encryptedCallSecret,
  });
}

// Start tracking a participant's shared screen in the call UI.
export function startWatchingStream(
  participantId: number,
  options?: { focus?: boolean },
) {
  const focus = options?.focus ?? false;
  const trackReady = getScreenShareTrackForParticipant(participantId) != null;

  useCall.setState((state) => ({
    watchedStreamParticipantIds: state.watchedStreamParticipantIds.includes(
      participantId,
    )
      ? state.watchedStreamParticipantIds
      : [...state.watchedStreamParticipantIds, participantId],
    pendingWatchedParticipantIds: trackReady
      ? state.pendingWatchedParticipantIds.filter((id) => id !== participantId)
      : state.pendingWatchedParticipantIds.includes(participantId)
        ? state.pendingWatchedParticipantIds
        : [...state.pendingWatchedParticipantIds, participantId],
    focusedParticipantId: focus ? participantId : state.focusedParticipantId,
    view: focus ? "focused" : state.view,
  }));
}

// Focus a participant in the main call view even when they are not sharing a screen.
export function focusParticipant(participantId: number) {
  useCall.setState({
    focusedParticipantId: participantId,
    view: "focused",
  });
}

// Stop tracking a participant's shared screen and clean up related UI state.
export function stopWatchingStream(participantId: number) {
  useCall.setState((state) => ({
    watchedStreamParticipantIds: state.watchedStreamParticipantIds.filter(
      (id) => id !== participantId,
    ),
    pendingWatchedParticipantIds: state.pendingWatchedParticipantIds.filter(
      (id) => id !== participantId,
    ),
    focusedParticipantId:
      state.focusedParticipantId === participantId
        ? null
        : state.focusedParticipantId,
    view:
      state.view === "focused" && state.focusedParticipantId === participantId
        ? "grid"
        : state.view,
  }));
}

// Exit focused screen-share mode for the currently highlighted participant.
export function stopWatchingFocusedStream() {
  const focusedParticipantId = useCall.getState().focusedParticipantId;

  if (focusedParticipantId == null) {
    return;
  }

  stopWatchingStream(focusedParticipantId);
}

let screenShareController: ReturnType<typeof createScreenShareController> | null =
  null;

function getScreenShareController() {
  if (!screenShareController) {
    screenShareController = createScreenShareController({
      room,
      getState: () => ({
        screenShareSession: useCall.getState().screenShareSession,
      }),
      setState: (updater) => {
        useCall.setState((state) =>
          typeof updater === "function"
            ? updater({ screenShareSession: state.screenShareSession })
            : updater,
        );
      },
      getLocalParticipantId: () => getParticipantId(room.localParticipant.identity),
      startWatching: startWatchingStream,
      stopWatching: stopWatchingStream,
      syncParticipantState,
    });
  }

  return screenShareController;
}

// Connect to LiveKit, enable the microphone, and move the UI into the live call.
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

// Tear down the active call session and return the store to a closed state.
export async function disconnect() {
  try {
    await getScreenShareController().clearPublishedScreenShare();
  } catch (error) {
    log(1, "call", "red", "Failed to clear screen share during disconnect", error);
  }

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
    focusedParticipantId: null,
    watchedStreamParticipantIds: [],
    pendingWatchedParticipantIds: [],
    activeScreenShareParticipantIds: [],
  });

  room.remoteParticipants.forEach((participant) => {
    participant.setVolume(1);
  });

  try {
    room.disconnect();
  } catch (error) {
    log(1, "call", "red", "Failed to disconnect from room", error);
  } finally {
    useCall.setState({ state: "closed" });
    syncParticipantState();
  }
}

// Prepare encryption and join or create a call with another user.
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

// Mute or restore incoming call audio for every remote participant.
export function toggleDeaf() {
  const nextDeaf = !useCall.getState().deaf;

  room.remoteParticipants.forEach((participant) => {
    participant.setVolume(nextDeaf ? 0 : 1);
  });

  if (nextDeaf && room.localParticipant.isMicrophoneEnabled) {
    toggleMute();
  }

  useCall.setState({ deaf: nextDeaf });
}

// Toggle the local microphone while keeping deaf/mute state consistent.
export async function toggleMute() {
  const micEnabled = useCall.getState().micEnabled;

  if (!micEnabled && useCall.getState().deaf) {
    toggleDeaf();
  }

  await room.localParticipant.setMicrophoneEnabled(!micEnabled);
  syncParticipantState();
}

// Start browser-native screen sharing for the current participant.
export async function startScreenShare(options?: ScreenShareCaptureOptions) {
  await getScreenShareController().startScreenShare(options);
}

// Start the Linux desktop capture path that renders frames through Tauri.
export async function startLinuxDesktopScreenShare(sourceId: string) {
  await getScreenShareController().startLinuxDesktopScreenShare(sourceId);
}

// Stop the local participant's active screen share and related previews.
export async function stopScreenShare() {
  await getScreenShareController().stopScreenShare();
}

// Toggle screen sharing on or off from UI controls.
export async function setScreenShareEnabled(
  enabled: boolean,
  options?: ScreenShareCaptureOptions,
) {
  await getScreenShareController().setScreenShareEnabled(enabled, options);
}

// Reset the in-memory call store when leaving the call experience entirely.
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
    focusedParticipantId: null,
    watchedStreamParticipantIds: [],
    pendingWatchedParticipantIds: [],
    activeScreenShareParticipantIds: [],
  });

  syncParticipantState();
}

// Attach the deep noise filter to the local microphone track when available.
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
  focusedParticipantId: null,
  watchedStreamParticipantIds: [],
  pendingWatchedParticipantIds: [],
  activeScreenShareParticipantIds: [],
  isEncrypted:
    room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted,
  room,
  keyProvider,
  e2eeWorker,
  runtime: null,
}));

// Register app-level call listeners and wire React dependencies into the store.
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
      encryptText: encryptText as EncryptTextFn,
      load: load as LoadFn,
      getUser: get as GetUserFn,
    });
  }, [decryptText, encryptText, get, getSharedSecret, load, navigate, send]);

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
          void sendCallInvite(invitedUserId)
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

    const onParticipantConnected = () => {
      syncParticipantState();
    };

    const onParticipantDisconnected = (participant: Participant) => {
      const participantId = getParticipantId(participant.identity);

      if (participantId != null) {
        stopWatchingStream(participantId);
      }

      syncParticipantState();
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
      if (track.kind === "audio" && track.sid) {
        attachRemoteAudio(track.sid, track.attach());
      }

      syncParticipantState();
    };

    const onTrackUnsubscribed = (
      track: RemoteTrack,
      _publication: unknown,
      participant: Participant,
    ) => {
      if (track.kind === "audio" && track.sid) {
        track.detach();
        detachRemoteAudio(track.sid);
      }

      const participantId = getParticipantId(participant.identity);

      if (
        participantId != null &&
        participant.getTrackPublication(Track.Source.ScreenShare)?.track == null
      ) {
        stopWatchingStream(participantId);
      }

      syncParticipantState();
    };

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
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
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
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
  }, [noiseFilter]);

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
