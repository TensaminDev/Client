import { useCallback, useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTTP } from "@tensamin/ttp";
import { log, toast } from "@tensamin/shared/log";
import { ttp } from "@tensamin/shared/data";
import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useSession } from "@tensamin/storage/session";
import { useUser } from "@tensamin/user/context";
import { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";
import {
  ExternalE2EEKeyProvider,
  LocalAudioTrack,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  type RemoteTrack,
  type ScreenShareCaptureOptions,
  Track,
  setLogExtension,
  getLogger,
} from "livekit-client";
import z from "zod";
import {
  createScreenShareController,
  type ScreenShareSession,
} from "./screenshare";
import {
  getSpeakingDetector,
  disposeSpeakingDetector,
} from "./speakingIndicator";
import InvitePopup from "./components/invitePopup";

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
type IncomingCallInvite = {
  callId: string;
  callSecret: string;
  senderId: number;
};
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
type RemoteVideoTrackSelector = Track.Kind | Track.Source;

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
  incomingCallInvite: IncomingCallInvite | null;
  callSecret: string | null;
  livekitToken: string | null;
  currentCallData: CurrentCallData;
  deaf: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
  screenShareSession: ScreenShareSession | null;
  focusedParticipantId: number | null;
  focusedParticipantType: "user" | "stream" | null;
  usersInFocusedViewHidden: boolean;
  watchedStreamParticipantIds: number[];
  pendingWatchedParticipantIds: number[];
  activeScreenShareParticipantIds: number[];
  isEncrypted: boolean;
  callIsFullscreen: boolean;
  callIsPopout: boolean;
  layoutVersion: number;
  screenRef: React.RefObject<HTMLDivElement | null> | null;
  runtime: Runtime | null;
  speakingParticipantIds: Set<number>;
  micGated: boolean;
};

let _keyProvider: ExternalE2EEKeyProvider | null = null;
let _e2eeWorker: Worker | null = null;
let _room: Room | null = null;

function getKeyProvider(): ExternalE2EEKeyProvider {
  if (!_keyProvider) {
    _keyProvider = new ExternalE2EEKeyProvider();
  }
  return _keyProvider;
}

function getE2EEWorker(): Worker {
  if (!_e2eeWorker) {
    _e2eeWorker = new Worker(
      new URL("livekit-client/e2ee-worker", import.meta.url),
    );
  }
  return _e2eeWorker;
}

export function getRoom(): Room {
  if (!_room) {
    _room = new Room({
      dynacast: true,
      adaptiveStream: true,
      loggerName: "tensamin",
      encryption: {
        keyProvider: getKeyProvider(),
        worker: getE2EEWorker(),
      },
    });
  }
  return _room;
}

const remoteAudioElements = new Map<string, HTMLMediaElement>();

const SCREEN_SHARE_PREVIEW_MAX_WIDTH = 320;
const SCREEN_SHARE_PREVIEW_MAX_HEIGHT = 180;
const SCREEN_SHARE_PREVIEW_QUALITY = 0.7;
const SCREEN_SHARE_PREVIEW_TIMEOUT_MS = 5000;

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

export function getParticipantId(identity: string | undefined): number | null {
  if (!identity) {
    return null;
  }

  const parsed = Number(identity);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAllParticipants(): Participant[] {
  const room = getRoom();
  return [...room.remoteParticipants.values(), room.localParticipant];
}

function getTrackPublicationBySource(
  participant: Participant | undefined,
  source: Track.Source,
) {
  if (!participant) {
    return undefined;
  }

  return [...participant.trackPublications.values()].find(
    (publication) => publication.source === source,
  );
}

function getRemoteParticipant(participantId: number) {
  return [...getRoom().remoteParticipants.values()].find(
    (participant) => getParticipantId(participant.identity) === participantId,
  );
}

function getRemoteTrackPublications(participantId: number) {
  return [
    ...(getRemoteParticipant(participantId)?.trackPublications.values() ?? []),
  ] as RemoteTrackPublication[];
}

function matchesRemoteTrackSelector(
  publication: Pick<RemoteTrackPublication, "kind" | "source">,
  selector: RemoteVideoTrackSelector,
) {
  return publication.source === selector || publication.kind === selector;
}

function syncRemoteParticipantTrackSubscriptions(participantId: number) {
  for (const publication of getRemoteTrackPublications(participantId)) {
    publication.setSubscribed(
      publication.kind === Track.Kind.Audio &&
        publication.source !== Track.Source.ScreenShareAudio,
    );
  }
}

function syncAllRemoteTrackSubscriptions() {
  for (const participant of getRoom().remoteParticipants.values()) {
    const participantId = getParticipantId(participant.identity);

    if (participantId != null) {
      syncRemoteParticipantTrackSubscriptions(participantId);
    }
  }
}

function getActiveScreenShareParticipantIds(): number[] {
  return getAllParticipants()
    .map((participant) => ({
      participantId: getParticipantId(participant.identity),
      hasScreenShare:
        getTrackPublicationBySource(participant, Track.Source.ScreenShare) !=
        null,
    }))
    .filter(
      (entry): entry is { participantId: number; hasScreenShare: true } =>
        entry.participantId != null && entry.hasScreenShare,
    )
    .map((entry) => entry.participantId);
}

function getScreenShareTrackForParticipant(participantId: number) {
  const participant = getAllParticipants().find(
    (entry) => getParticipantId(entry.identity) === participantId,
  );

  return getTrackPublicationBySource(participant, Track.Source.ScreenShare)
    ?.track;
}

function hasParticipant(participantId: number) {
  return getAllParticipants().some(
    (participant) => getParticipantId(participant.identity) === participantId,
  );
}

function getLocalScreenShareTrack(): MediaStreamTrack | null {
  const track = getTrackPublicationBySource(
    getRoom().localParticipant,
    Track.Source.ScreenShare,
  )?.track;

  if (!track || track.kind !== Track.Kind.Video) {
    return null;
  }

  return track.mediaStreamTrack;
}

async function updateLocalParticipantAttributes(
  attributes: Record<string, string>,
) {
  log(2, "call", "purple", "Updating local participant attributes", {
    attributeKeys: Object.keys(attributes),
    screenSharePreviewLength: attributes.screenSharePreview?.length ?? 0,
  });

  await getRoom()
    .localParticipant.setAttributes(attributes)
    .catch((error) => {
      log(1, "call", "red", "Failed to update local participant attributes", {
        attributes: Object.keys(attributes),
        error,
      });
      throw error;
    });

  log(2, "call", "purple", "Updated local participant attributes", {
    attributeKeys: Object.keys(attributes),
    screenSharePreviewLength: attributes.screenSharePreview?.length ?? 0,
  });
}

async function waitForScreenSharePreviewFrame(video: HTMLVideoElement) {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    log(2, "call", "purple", "Screen share preview frame already ready", {
      readyState: video.readyState,
      width: video.videoWidth,
      height: video.videoHeight,
    });
    return;
  }

  log(2, "call", "purple", "Waiting for screen share preview frame", {
    readyState: video.readyState,
  });

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for screen share preview frame."));
    }, SCREEN_SHARE_PREVIEW_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.onloadeddata = null;
      video.oncanplay = null;
      video.onerror = null;
    };

    const ready = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        log(2, "call", "purple", "Screen share preview frame became ready", {
          readyState: video.readyState,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        cleanup();
        resolve();
      }
    };

    video.onloadeddata = ready;
    video.oncanplay = ready;
    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load screen share preview frame."));
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => {
        ready();
      });
    }

    ready();
  });
}

async function publishScreenSharePreview() {
  const videoTrack = getLocalScreenShareTrack();

  if (!videoTrack) {
    log(
      2,
      "call",
      "purple",
      "Skipping screen share preview publish: no local video track",
    );
    return;
  }

  log(2, "call", "purple", "Publishing screen share preview", {
    trackId: videoTrack.id,
    readyState: videoTrack.readyState,
    muted: videoTrack.muted,
  });

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = new MediaStream([videoTrack]);

  try {
    await video.play().catch(() => undefined);
    log(2, "call", "purple", "Screen share preview video play attempted", {
      readyState: video.readyState,
    });
    await waitForScreenSharePreviewFrame(video);

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Screen share preview video has no dimensions.");
    }

    log(2, "call", "purple", "Capturing screen share preview frame", {
      width: video.videoWidth,
      height: video.videoHeight,
    });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Failed to create screen share preview canvas.");
    }

    canvas.width = SCREEN_SHARE_PREVIEW_MAX_WIDTH;
    canvas.height = SCREEN_SHARE_PREVIEW_MAX_HEIGHT;

    const scale = Math.min(
      canvas.width / video.videoWidth,
      canvas.height / video.videoHeight,
    );
    const drawWidth = Math.max(1, Math.round(video.videoWidth * scale));
    const drawHeight = Math.max(1, Math.round(video.videoHeight * scale));
    const x = Math.floor((canvas.width - drawWidth) / 2);
    const y = Math.floor((canvas.height - drawHeight) / 2);

    context.fillStyle = "#111111";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, x, y, drawWidth, drawHeight);

    const preview = canvas.toDataURL(
      "image/webp",
      SCREEN_SHARE_PREVIEW_QUALITY,
    );

    log(2, "call", "purple", "Generated screen share preview", {
      previewLength: preview.length,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    await updateLocalParticipantAttributes({
      screenSharePreview: preview,
    });

    log(2, "call", "purple", "Published screen share preview");
  } catch (error) {
    log(1, "call", "red", "Failed to publish screen share preview", error);
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

async function clearScreenSharePreview() {
  log(2, "call", "purple", "Clearing screen share preview");

  await updateLocalParticipantAttributes({
    screenSharePreview: "",
  }).catch((error) => {
    log(1, "call", "red", "Failed to clear screen share preview", error);
  });
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
    focusedParticipantType:
      focusedParticipantId == null ? null : state.focusedParticipantType,
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

export function getRoomMetadata() {
  const roomMetadata = getRoom().metadata;
  try {
    const data = JSON.parse(roomMetadata || '{"admins": []}');
    return data as { admins: number[] };
  } catch {
    return { admins: [] };
  }
}

// Sync local participant flags and screen-share derived state for the active call UI.
export function syncParticipantState() {
  const { screenShareSession } = useCall.getState();
  const room = getRoom();

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

export function setUsersInFocusedViewHidden(usersInFocusedViewHidden: boolean) {
  useCall.setState((state) => ({
    usersInFocusedViewHidden,
    layoutVersion:
      state.usersInFocusedViewHidden === usersInFocusedViewHidden
        ? state.layoutVersion
        : state.layoutVersion + 1,
  }));
}

export function setCallIsFullscreen(callIsFullscreen: boolean) {
  useCall.setState({ callIsFullscreen });
}

export function setCallIsPopout(callIsPopout: boolean) {
  useCall.setState({ callIsPopout });
}

export function triggerCallLayoutCalculation() {
  useCall.setState((state) => ({
    layoutVersion: state.layoutVersion + 1,
  }));
}

export function setScreenRef(
  screenRef: React.RefObject<HTMLDivElement | null> | null,
) {
  useCall.setState({ screenRef });
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
  const ownPublicKey = await runtime
    .getUser(ownUserId)
    .then((data) => data.public_key);
  const remotePublicKey = await runtime
    .getUser(userId)
    .then((data) => data.public_key);
  const sharedSecret = await runtime.getSharedSecret(
    privateKey,
    ownPublicKey,
    remotePublicKey,
  );
  const encryptedCallSecret = await runtime.encryptText(
    sharedSecret,
    callSecret,
  );

  await runtime.send("call_invite", {
    receiver_id: userId,
    call_id: callId,
    call_secret: encryptedCallSecret,
  });
}

// Start tracking a participant's shared screen in the call UI.
export function startWatchingStream(participantId: number) {
  const trackReady = getScreenShareTrackForParticipant(participantId) != null;

  setParticipantTrackSubscribed(participantId, Track.Source.ScreenShare);
  setParticipantTrackSubscribed(participantId, Track.Source.ScreenShareAudio);

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
    focusedParticipantId: participantId,
    focusedParticipantType: "stream",
  }));
}

// Toggle remote track subscriptions using LiveKit's built-in publication API.
export function setParticipantTrackSubscribed(
  participantId: number,
  selector: RemoteVideoTrackSelector,
  subscribed = true,
) {
  for (const publication of getRemoteTrackPublications(participantId)) {
    if (matchesRemoteTrackSelector(publication, selector)) {
      publication.setSubscribed(subscribed);
    }
  }

  syncParticipantState();
}

// Focus a participant in the main call view even when they are not sharing a screen.
export function focusParticipant(
  participantId: number,
  type: "user" | "stream" = "user",
) {
  useCall.setState({
    focusedParticipantId: participantId,
    focusedParticipantType: type,
    view: "focused",
  });
}

// Stop tracking a participant's shared screen and clean up related UI state.
export function stopWatchingStream(participantId: number) {
  setParticipantTrackSubscribed(participantId, Track.Source.ScreenShare, false);
  setParticipantTrackSubscribed(
    participantId,
    Track.Source.ScreenShareAudio,
    false,
  );

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
    focusedParticipantType:
      state.focusedParticipantId === participantId
        ? null
        : state.focusedParticipantType,
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

let screenShareController: ReturnType<
  typeof createScreenShareController
> | null = null;

function getNoiseFilterAssetBaseUrl() {
  if (window.location.protocol === "file:") {
    return new URL("./assets", document.baseURI).href.replace(/\/$/, "");
  }

  return "/assets";
}

function getScreenShareController() {
  if (!screenShareController) {
    screenShareController = createScreenShareController({
      room: getRoom(),
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
      getLocalParticipantId: () =>
        getParticipantId(getRoom().localParticipant.identity),
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

  await getRoom()
    .connect("wss://call.tensamin.net", token, {
      autoSubscribe: false,
    })
    .catch((error) => {
      useCall.setState({ state: "closed", livekitToken: null });
      log(1, "call", "red", "Failed to connect to room", error);
      toast(
        "error",
        error instanceof Error ? error.message : "Failed to connect to call.",
      );
      throw error;
    });

  syncAllRemoteTrackSubscriptions();

  await getRoom()
    .localParticipant.setMicrophoneEnabled(true)
    .catch((error) => {
      log(1, "call", "red", "Failed to enable microphone", error);
      toast("error", "Failed to enable microphone.");
      throw error;
    });

  syncParticipantState();
}

// Tear down the active call session and return the store to a closed state.
export async function disconnect() {
  disposeSpeakingDetector();
  await clearScreenSharePreview();

  try {
    await getScreenShareController().clearPublishedScreenShare();
  } catch (error) {
    log(
      1,
      "call",
      "red",
      "Failed to clear screen share during disconnect",
      error,
    );
  }

  useCall.setState({
    state: "closing",
    invitedUserId: null,
    callId: null,
    incomingCallInvite: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    view: "preview",
    screenShareSession: null,
    focusedParticipantId: null,
    focusedParticipantType: null,
    usersInFocusedViewHidden: false,
    watchedStreamParticipantIds: [],
    pendingWatchedParticipantIds: [],
    activeScreenShareParticipantIds: [],
    micGated: false,
  });

  getRoom().remoteParticipants.forEach((participant) => {
    participant.setVolume(1);
  });

  try {
    await getRoom().disconnect();
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
  const state = useCall.getState().state;

  if (state !== "closed") {
    await disconnect();
  }

  log(2, "call", "purple", "Call creation initialised");
  useCall.setState({
    state: "encrypting",
    invitedUserId: sendInvite && !existingCallId ? userId : null,
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

      await getKeyProvider().setKey(decryptedSecret);
      await getRoom().setE2EEEnabled(true);
      useCall.setState({ callSecret: decryptedSecret });
    } catch (err) {
      log(1, "call", "red", "Failed getting call secret", err);
      disconnect();
      return;
    }
  } else {
    const random = crypto.randomUUID();

    await getKeyProvider().setKey(random);
    await getRoom().setE2EEEnabled(true);
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
export async function toggleDeaf() {
  const nextDeaf = !useCall.getState().deaf;

  getRoom().remoteParticipants.forEach((participant) => {
    participant.setVolume(nextDeaf ? 0 : 1);
  });

  if (nextDeaf && getRoom().localParticipant.isMicrophoneEnabled) {
    await toggleMute();
  }

  await updateLocalParticipantAttributes({
    deafened: nextDeaf ? "true" : "false",
  });

  getSpeakingDetector().setDeaf(nextDeaf);
  useCall.setState({ deaf: nextDeaf });
}

// Toggle the local microphone while keeping deaf/mute state consistent.
export async function toggleMute() {
  const micEnabled = useCall.getState().micEnabled;

  if (!micEnabled && useCall.getState().deaf) {
    await toggleDeaf();
  }

  await getRoom().localParticipant.setMicrophoneEnabled(!micEnabled);
  syncParticipantState();
}

// Start browser-native screen sharing for the current participant.
export async function startScreenShare(options?: ScreenShareCaptureOptions) {
  await getScreenShareController().startScreenShare(options);
  await publishScreenSharePreview();
}

// Start the Linux desktop capture path that renders frames through Tauri.
export async function startLinuxDesktopScreenShare(sourceId: string) {
  await getScreenShareController().startLinuxDesktopScreenShare(sourceId);
  await publishScreenSharePreview();
}

// Stop the local participant's active screen share and related previews.
export async function stopScreenShare() {
  await getScreenShareController().stopScreenShare();
  await clearScreenSharePreview();
}

// Toggle screen sharing on or off from UI controls.
export async function setScreenShareEnabled(
  enabled: boolean,
  options?: ScreenShareCaptureOptions,
) {
  await getScreenShareController().setScreenShareEnabled(enabled, options);

  if (enabled) {
    await publishScreenSharePreview();
    return;
  }

  await clearScreenSharePreview();
}

// Reset the in-memory call store when leaving the call experience entirely.
export function resetCallState() {
  useCall.setState({
    state: "closed",
    view: "preview",
    invitedUserId: null,
    callId: null,
    incomingCallInvite: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    screenShareSession: null,
    focusedParticipantId: null,
    focusedParticipantType: null,
    usersInFocusedViewHidden: false,
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
  const microphoneTrack = getRoom().localParticipant.getTrackPublication(
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

  const participantId = getParticipantId(getRoom().localParticipant.identity);
  if (participantId != null) {
    const processedTrack = microphoneTrack.mediaStreamTrack;
    getSpeakingDetector().addTrack(
      participantId,
      processedTrack.clone(),
      processedTrack,
    );
  }
}

export const useCall = create<CallStore>(() => ({
  state: "closed",
  view: "preview",
  invitedUserId: null,
  callId: null,
  incomingCallInvite: null,
  callSecret: null,
  livekitToken: null,
  currentCallData: null,
  deaf: false,
  micEnabled: false,
  screenShareEnabled: false,
  screenShareSession: null,
  focusedParticipantId: null,
  focusedParticipantType: null,
  usersInFocusedViewHidden: false,
  watchedStreamParticipantIds: [],
  pendingWatchedParticipantIds: [],
  activeScreenShareParticipantIds: [],
  isEncrypted: false,
  callIsFullscreen: false,
  callIsPopout: false,
  layoutVersion: 0,
  screenRef: null,
  runtime: null,
  speakingParticipantIds: new Set(),
  micGated: false,
}));

// Register app-level call listeners and wire React dependencies into the store.
export function useInitializeCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const { send, subscribePush } = useTTP();
  const { getSharedSecret, decryptText, encryptText } = useCrypto();
  const { load } = useStorage();
  const { insertCall } = useSession();
  const { get } = useUser();

  const callId = useCall((state) => state.callId);
  const view = useCall((state) => state.view);
  const incomingCallInvite = useCall((state) => state.incomingCallInvite);

  const listenersRegistered = useRef(false);
  const noiseFilter = useMemo(
    () =>
      new DeepFilterNoiseFilterProcessor({
        enabled: true,
        enableNoiseReduction: true,
        noiseReductionLevel: 60,
        sampleRate: 48000,
        assetConfig: {
          cdnUrl: getNoiseFilterAssetBaseUrl(),
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
    (callId: string, callSecret: string, senderId: number) => {
      useCall.setState({
        incomingCallInvite: { callId, callSecret, senderId },
      });
    },
    [],
  );

  const setInvitePopupOpen = useCallback((open: boolean) => {
    if (!open) {
      useCall.setState({ incomingCallInvite: null });
    }
  }, []);

  const respondToInvite = useCallback(
    (accepted: boolean) => {
      const invite = useCall.getState().incomingCallInvite;

      useCall.setState({ incomingCallInvite: null });

      if (!invite) {
        return;
      }

      insertCall({
        call_id: invite.callId,
        call_secret: invite.callSecret,
        call_members: [invite.senderId],
      });

      if (accepted) {
        joinCall(
          invite.senderId,
          invite.callSecret,
          invite.callId,
          false,
        ).catch((err) => {
          log(1, "call", "red", "Failed to join call", err);
        });
        return;
      }

      log(2, "call", "purple", "Declined call invite", {
        callId: invite.callId,
        senderId: invite.senderId,
      });
    },
    [insertCall],
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

  // fullscreen sync
  useEffect(() => {
    const handleFullscreenChange = () => {
      const screenRef = useCall.getState().screenRef;
      if (!screenRef?.current) return;

      if (screenRef.current === document.fullscreenElement) {
        setCallIsFullscreen(true);
      } else {
        setCallIsFullscreen(false);
      }

      triggerCallLayoutCalculation();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // esc key listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        useCall.getState().callIsFullscreen &&
        location.pathname.startsWith("/call")
      ) {
        useCall.setState({ callIsFullscreen: false });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname]);

  // room setup
  useEffect(() => {
    if (listenersRegistered.current) {
      return;
    }

    listenersRegistered.current = true;

    const onConnected = async () => {
      useCall.setState({ state: "open" });
      syncParticipantState();

      const detector = getSpeakingDetector();
      const localParticipantId = getParticipantId(
        room.localParticipant.identity,
      );
      if (localParticipantId != null) {
        detector.setLocalParticipantId(localParticipantId);
      }

      const [start, end] = await Promise.all([
        load("call_mute_range_start"),
        load("call_mute_range_end"),
      ]);
      detector.setGateThresholds(start, end);

      // Scan existing audio tracks for speaking detection
      for (const participant of getAllParticipants()) {
        const participantId = getParticipantId(participant.identity);
        if (participantId == null) continue;

        for (const publication of participant.trackPublications.values()) {
          if (
            publication.kind === Track.Kind.Audio &&
            publication.source === Track.Source.Microphone &&
            publication.track
          ) {
            const mediaTrack = publication.track.mediaStreamTrack;
            if (participant === room.localParticipant) {
              const clonedTrack = mediaTrack.clone();
              detector.addTrack(participantId, clonedTrack, mediaTrack);
            } else {
              detector.addTrack(participantId, mediaTrack);
            }
          }
        }
      }

      const invitedUserId = useCall.getState().invitedUserId;

      if (invitedUserId != null) {
        setTimeout(async () => {
          void sendCallInvite(invitedUserId).catch((error) => {
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
      syncAllRemoteTrackSubscriptions();
      syncParticipantState();
    };

    const onParticipantDisconnected = (participant: Participant) => {
      const participantId = getParticipantId(participant.identity);

      if (participantId != null) {
        stopWatchingStream(participantId);
        getSpeakingDetector().removeParticipant(participantId);
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

    const onLocalTrackPublished = (publication: LocalTrackPublication) => {
      if (
        publication.kind === Track.Kind.Audio &&
        publication.source === Track.Source.Microphone &&
        publication.track
      ) {
        const participantId = getParticipantId(room.localParticipant.identity);
        if (participantId != null) {
          const originalTrack = publication.track.mediaStreamTrack;
          const clonedTrack = originalTrack.clone();
          getSpeakingDetector().addTrack(
            participantId,
            clonedTrack,
            originalTrack,
          );
        }
      }
      syncParticipantState();
      void ensureNoiseFilter(noiseFilter);
    };

    const onLocalTrackUnpublished = (publication: LocalTrackPublication) => {
      if (
        publication.kind === Track.Kind.Audio &&
        publication.source === Track.Source.Microphone
      ) {
        const participantId = getParticipantId(room.localParticipant.identity);
        if (participantId != null) {
          getSpeakingDetector().removeParticipant(participantId);
        }
      }
      syncParticipantState();
    };

    const onTrackPublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      const participantId = getParticipantId(participant.identity);

      if (participantId != null) {
        if (
          publication.kind === Track.Kind.Audio &&
          publication.source !== Track.Source.ScreenShareAudio
        ) {
          publication.setSubscribed(true);
        } else {
          publication.setSubscribed(false);
        }
      }

      onParticipantStateChange();
    };

    const onTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind === "audio" && track.sid) {
        attachRemoteAudio(track.sid, track.attach());

        const participantId = getParticipantId(participant.identity);
        if (
          participantId != null &&
          publication.source === Track.Source.Microphone
        ) {
          getSpeakingDetector().addTrack(participantId, track.mediaStreamTrack);
        }
      }

      syncParticipantState();
    };

    const onTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: Participant,
    ) => {
      const participantId = getParticipantId(participant.identity);

      if (track.kind === "audio" && track.sid) {
        track.detach();
        detachRemoteAudio(track.sid);

        if (
          participantId != null &&
          publication.source === Track.Source.Microphone
        ) {
          getSpeakingDetector().removeParticipant(participantId);
        }
      }

      if (
        participantId != null &&
        getTrackPublicationBySource(participant, Track.Source.ScreenShare)
          ?.track == null
      ) {
        stopWatchingStream(participantId);
      }

      syncParticipantState();
    };

    const room = getRoom();
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackPublished, onTrackPublished);
    room.on(RoomEvent.TrackUnpublished, onParticipantStateChange);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackMuted, onParticipantStateChange);
    room.on(RoomEvent.TrackUnmuted, onParticipantStateChange);
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
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
      room.off(RoomEvent.TrackPublished, onTrackPublished);
      room.off(RoomEvent.TrackUnpublished, onParticipantStateChange);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.TrackMuted, onParticipantStateChange);
      room.off(RoomEvent.TrackUnmuted, onParticipantStateChange);
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
      room.off(RoomEvent.MediaDevicesError, onMediaDeviceFailure);
      room.off(RoomEvent.EncryptionError, onEncryptionError);
      room.off(RoomEvent.ConnectionStateChanged, onParticipantStateChange);
      clearRemoteAudio();
      listenersRegistered.current = false;
      room.disconnect();
      if (_e2eeWorker) _e2eeWorker.terminate();
    };
  }, [noiseFilter, load]);

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

  return incomingCallInvite ? (
    <InvitePopup
      open
      setOpen={setInvitePopupOpen}
      onAccept={respondToInvite}
      user={incomingCallInvite.senderId}
    />
  ) : null;
}
