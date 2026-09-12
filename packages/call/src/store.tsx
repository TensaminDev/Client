import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMTP } from "@tensamin/mtp";
import { log, toast } from "@tensamin/shared/log";
import { mtp, storageDefaults, type Storage } from "@tensamin/shared/data";
import { playSound, stopSound } from "@tensamin/shared/sounds";
import { bytesToBase64, MTPProtocolError } from "mtp";
import {
  deriveCallSecretId,
  kemPublicKeyFromPublicKeyBundle,
  unwrapCallSecret,
  wrapCallSecret,
} from "@tensamin/crypto/callSecret";
import { useStorage } from "@tensamin/storage/context";
import { useSession } from "@tensamin/identity/session";
import { useUser } from "@tensamin/identity/context";
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
  Track,
  setLogExtension,
  getLogger,
} from "livekit-client";
import z from "zod";
import {
  createMediaShareController,
  getSupportedScreenShareCodecs,
  isMediaShareReconfiguring,
  resolveScreenShareCodec,
  type ScreenShareSettings,
} from "./mediaShare/controller";
import type { MediaShareRequest } from "./mediaShare";
import {
  getSpeakingDetector,
  disposeSpeakingDetector,
} from "./speakingIndicator";
import InvitePopup from "./components/invitePopup";
import {
  useCall,
  type CallRuntime as Runtime,
  type CallView,
  type CurrentCallData,
  type WrappedCallSecret,
} from "./state";

export { useCall } from "./state";

// logging
setLogExtension(
  (level, message, context) =>
    context
      ? log(level, "livekit", "blue", message, context)
      : log(level, "livekit", "blue", message),
  getLogger("tensamin"),
);

type ProtocolCallSecret = NonNullable<
  z.infer<typeof mtp.CallToken.request>["CallSecret"]
>;

type ProtocolCallSecretResponse = NonNullable<
  z.infer<typeof mtp.CallInvite.response>["CallSecret"]
>;

type RemoteVideoTrackSelector = Track.Kind | Track.Source;

let _keyProvider: ExternalE2EEKeyProvider | null = null;
let _e2eeWorker: Worker | null = null;
let _room: Room | null = null;
let callAttemptGeneration = 0;
let microphoneDeviceGeneration = 0;
let latestMicrophoneDeviceId = storageDefaults.call_microphone_device_id;
let callSettingsGeneration = 0;

const callSettingKeys = [
  "call_microphone_device_id",
  "call_speaker_device_id",
  "call_noise_suppression_enabled",
  "call_noise_suppression_level",
  "call_echo_cancellation",
  "call_voice_isolation",
  "call_automatic_gain_control",
  "call_noise_gate_enabled",
  "call_event_sounds_enabled",
  "call_sound_volume",
  "call_screen_share_resolution",
  "call_screen_share_frame_rate",
  "call_screen_share_audio",
  "call_screen_share_codec",
  "call_camera_resolution",
  "call_camera_frame_rate",
  "call_mute_range_start",
  "call_mute_range_end",
] as const satisfies readonly (keyof Storage)[];

type CallSettings = Pick<Storage, (typeof callSettingKeys)[number]>;
let currentCallSettings: CallSettings = Object.fromEntries(
  callSettingKeys.map((key) => [key, storageDefaults[key]]),
) as CallSettings;

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
const pendingRemoteScreenShareEnds = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
let callJingle: HTMLAudioElement | null = null;
let callJingleGeneration = 0;

const CALL_SECRET_VERSION = 1;
const SCREEN_SHARE_PREVIEW_MAX_WIDTH = 320;
const SCREEN_SHARE_PREVIEW_MAX_HEIGHT = 180;
const SCREEN_SHARE_PREVIEW_QUALITY = 0.7;
const SCREEN_SHARE_PREVIEW_TIMEOUT_MS = 5000;

async function startCallJingle(shouldPlay: () => boolean) {
  const generation = ++callJingleGeneration;
  stopSound(callJingle);
  callJingle = null;

  const runtime = requireRuntime(useCall.getState().runtime);
  const [jingle, volume] = await Promise.all([
    runtime.load("settings.call_jingle"),
    runtime.load("call_sound_volume"),
  ]);

  if (generation !== callJingleGeneration || !shouldPlay()) {
    return;
  }

  callJingle = playSound(
    jingle === "jingle_2" ? "call_jingle_2" : "call_jingle_1",
    true,
    volume / 100,
  );
}

function stopCallJingle() {
  callJingleGeneration += 1;
  stopSound(callJingle);
  callJingle = null;
}

function playCallEvent(sound: Parameters<typeof playSound>[0]) {
  if (!currentCallSettings.call_event_sounds_enabled) return;
  playSound(sound, false, currentCallSettings.call_sound_volume / 100);
}

async function updateScreenShareCodecAndEncoderStatus(
  publication?: LocalTrackPublication,
) {
  const activePublication =
    publication ??
    getRoom().localParticipant.getTrackPublication(Track.Source.ScreenShare);
  const report = await activePublication?.track?.getRTCStatsReport();
  if (!report) return;

  let codec: string | null = null;
  let softwareEncoder = false;
  let hardwareEncoder = false;
  report.forEach((stat) => {
    if (stat.type !== "outbound-rtp" || stat.kind !== "video") return;
    const codecStat = stat.codecId ? report.get(stat.codecId) : undefined;
    if (codecStat?.mimeType)
      codec = String(codecStat.mimeType).split("/").pop() ?? null;
    const implementation = String(
      (stat as RTCStats & { encoderImplementation?: string })
        .encoderImplementation ?? "",
    );
    if (/software|libvpx|openh264/i.test(implementation))
      softwareEncoder = true;
    if (
      (stat as RTCStats & { powerEfficientEncoder?: boolean })
        .powerEfficientEncoder === true ||
      (/hardware/i.test(implementation) && !softwareEncoder)
    ) {
      hardwareEncoder = true;
    }
  });
  useCall.setState({ screenShareActiveCodec: codec });

  const gpuStatus =
    await window.tensaminDesktop?.media?.getGpuFeatureStatus?.();
  if (!gpuStatus) return;
  const managed = new Set([
    "Hardware video encoding is unavailable.",
    "Hardware video encoding could not be verified.",
  ]);
  const warnings = useCall
    .getState()
    .warnings.filter((warning) => !managed.has(warning));
  if (softwareEncoder || gpuStatus.videoEncode !== "enabled") {
    warnings.push("Hardware video encoding is unavailable.");
  } else if (!hardwareEncoder) {
    warnings.push("Hardware video encoding could not be verified.");
  }
  useCall.setState({ warnings });
}

async function updateElectronExpectedEncoderWarning() {
  const gpuStatus =
    await window.tensaminDesktop?.media?.getGpuFeatureStatus?.();
  if (!gpuStatus) return;
  const managed = new Set([
    "Hardware video encoding is unavailable.",
    "Hardware video encoding could not be verified.",
  ]);
  const warnings = useCall
    .getState()
    .warnings.filter((warning) => !managed.has(warning));
  warnings.push(
    gpuStatus.videoEncode === "enabled"
      ? "Hardware video encoding could not be verified."
      : "Hardware video encoding is unavailable.",
  );
  useCall.setState({ warnings });
}

function protocolBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function normalizeWrappedCallSecret(
  callSecret:
    WrappedCallSecret | ProtocolCallSecret | ProtocolCallSecretResponse,
): WrappedCallSecret {
  if ("secretId" in callSecret) {
    return callSecret;
  }

  return {
    secretId: callSecret.SecretId,
    versionNumber: callSecret.VersionNumber,
    encryptedSecret: callSecret.EncryptedSecret,
    kemCiphertext: callSecret.KemCiphertext,
    wrappingScheme: callSecret.WrappingScheme,
  };
}

function protocolCallSecret(callSecret: WrappedCallSecret): ProtocolCallSecret {
  return {
    SecretId: callSecret.secretId,
    VersionNumber: callSecret.versionNumber,
    EncryptedSecret: protocolBytes(callSecret.encryptedSecret),
    KemCiphertext: protocolBytes(callSecret.kemCiphertext),
    WrappingScheme: callSecret.wrappingScheme,
  };
}

function randomCallSecret(): string {
  return bytesToBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

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
  const state = useCall.getState();
  const watchesScreen =
    state.watchedStreamParticipantIds.includes(participantId);
  const cameraDisabled =
    state.disabledCameraParticipantIds.includes(participantId);

  for (const publication of getRemoteTrackPublications(participantId)) {
    const subscribed =
      publication.source === Track.Source.Camera
        ? !cameraDisabled
        : publication.source === Track.Source.ScreenShare ||
            publication.source === Track.Source.ScreenShareAudio
          ? watchesScreen
          : publication.kind === Track.Kind.Audio;
    publication.setSubscribed(subscribed);
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
  const state = useCall.getState();
  const { cameraSession, screenShareSession } = state;
  const room = getRoom();
  const isEncrypted =
    room.localParticipant.isE2EEEnabled && room.localParticipant.isEncrypted;
  const warnings = state.warnings.filter(
    (warning) => warning !== "The connected call is not encrypted.",
  );
  if (state.state === "open" && !isEncrypted) {
    warnings.push("The connected call is not encrypted.");
  }

  useCall.setState({
    micEnabled: room.localParticipant.isMicrophoneEnabled,
    cameraEnabled:
      cameraSession != null || room.localParticipant.isCameraEnabled,
    screenShareEnabled:
      screenShareSession != null || room.localParticipant.isScreenShareEnabled,
    isEncrypted,
    warnings,
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
export function setCurrentCallData(currentCallData: CurrentCallData) {
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

function callRouteOwner(): number | undefined {
  return useCall.getState().callRoute?.ownerOmikronId;
}

// Request the LiveKit token that authorizes this client to join a call.
export async function getCallToken(
  callId: string,
  callSecret?: ProtocolCallSecret,
  ownerOmikronId?: number,
) {
  const response = await requireRuntime(useCall.getState().runtime)
    .callControl.request(ownerOmikronId, "CallToken", {
      CallId: callId,
      ...(callSecret ? { CallSecret: callSecret } : {}),
    })
    .catch((err) => {
      log(1, "call", "red", "Failed to get call token", err);
      throw err;
    });

  return mtp.CallToken.response.parse(response.data);
}

async function wrapCallSecretForUser(
  userId: number,
  callId: string,
  callSecret: string,
): Promise<ProtocolCallSecret> {
  const remotePublicKey = await requireRuntime(
    useCall.getState().runtime,
  ).getPublicKey(userId);
  const secretId = deriveCallSecretId(callId);
  const wrapped = await wrapCallSecret({
    callSecret,
    recipientKemPublicKey: kemPublicKeyFromPublicKeyBundle(remotePublicKey),
    callId,
    secretId,
    version: CALL_SECRET_VERSION,
  });

  return {
    SecretId: secretId,
    VersionNumber: CALL_SECRET_VERSION,
    EncryptedSecret: protocolBytes(wrapped.encryptedSecret),
    KemCiphertext: protocolBytes(wrapped.kemCiphertext),
    WrappingScheme: wrapped.wrappingScheme,
  };
}

// Encrypt the active call secret for a recipient and send the call invite.
export async function sendCallInvite(userId: number) {
  const runtime = requireRuntime(useCall.getState().runtime);
  const { callId, callSecret } = useCall.getState();

  if (!callId || !callSecret) {
    throw new Error("Cannot send call invite without an active call.");
  }

  useCall.setState({ invitedUserId: userId });

  try {
    const response = await runtime.callControl.request(
      useCall.getState().callRoute?.ownerOmikronId,
      "CallInvite",
      {
        ReceiverId: userId,
        CallId: callId,
        CallSecret: await wrapCallSecretForUser(userId, callId, callSecret),
      },
    );

    if (response.type.startsWith("Error")) {
      throw new Error(`Call invitation failed: ${response.type}`);
    }
    mtp.CallInvite.response.parse(response.data);
  } catch (error) {
    if (useCall.getState().invitedUserId === userId) {
      useCall.setState({ invitedUserId: null });
      stopCallJingle();
    }
    throw error;
  }
}

// Start tracking a participant's shared screen in the call UI.
export function startWatchingStream(participantId: number) {
  const trackReady = getScreenShareTrackForParticipant(participantId) != null;
  const alreadyWatching = useCall
    .getState()
    .watchedStreamParticipantIds.includes(participantId);
  const localParticipantId = getParticipantId(
    getRoom().localParticipant.identity,
  );

  if (!alreadyWatching && participantId !== localParticipantId) {
    playCallEvent("stream_watch_start");
  }

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

export function setParticipantCameraDisabled(
  participantId: number,
  disabled: boolean,
) {
  useCall.setState((state) => ({
    disabledCameraParticipantIds: disabled
      ? state.disabledCameraParticipantIds.includes(participantId)
        ? state.disabledCameraParticipantIds
        : [...state.disabledCameraParticipantIds, participantId]
      : state.disabledCameraParticipantIds.filter((id) => id !== participantId),
  }));
  setParticipantTrackSubscribed(participantId, Track.Source.Camera, !disabled);
}

// Focus a participant in the main call view even when they are not sharing a screen.
export function focusParticipant(
  participantId: number,
  type: "user" | "stream" = "user",
) {
  useCall.setState({
    focusedParticipantId: participantId,
    lastFocusedParticipantId: participantId,
    focusedParticipantType: type,
    view: "focused",
  });
}

// Stop tracking a participant's shared screen and clean up related UI state.
export function stopWatchingStream(participantId: number) {
  const wasWatching = useCall
    .getState()
    .watchedStreamParticipantIds.includes(participantId);
  const localParticipantId = getParticipantId(
    getRoom().localParticipant.identity,
  );

  if (wasWatching && participantId !== localParticipantId) {
    playCallEvent("stream_watch_end");
  }

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

let mediaShareController: ReturnType<typeof createMediaShareController> | null =
  null;

function getNoiseFilterAssetBaseUrl() {
  if (window.location.protocol === "file:") {
    return new URL("./assets", document.baseURI).href.replace(/\/$/, "");
  }

  return "/assets";
}

function getMediaShareController() {
  if (!mediaShareController) {
    mediaShareController = createMediaShareController({
      room: getRoom(),
      getState: () => ({
        screenShareSession: useCall.getState().screenShareSession,
        cameraSession: useCall.getState().cameraSession,
      }),
      setState: (updater) => {
        useCall.setState((state) =>
          typeof updater === "function"
            ? updater({
                screenShareSession: state.screenShareSession,
                cameraSession: state.cameraSession,
              })
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

  return mediaShareController;
}

export async function getCallDevices(kind: "audioinput" | "audiooutput") {
  return Room.getLocalDevices(kind);
}

export function canSwitchAudioOutput() {
  return "setSinkId" in HTMLMediaElement.prototype;
}

export function getSupportedCallScreenShareCodecs() {
  return getSupportedScreenShareCodecs();
}

export async function switchCallDevice(
  kind: "audioinput" | "audiooutput",
  deviceId: string,
) {
  const generation =
    kind === "audioinput"
      ? ++microphoneDeviceGeneration
      : microphoneDeviceGeneration;
  if (kind === "audioinput") latestMicrophoneDeviceId = deviceId;
  const switched = await getRoom().switchActiveDevice(kind, deviceId);
  if (!switched) return false;
  if (kind === "audioinput" && generation !== microphoneDeviceGeneration) {
    await getRoom().switchActiveDevice(kind, latestMicrophoneDeviceId);
    return false;
  }
  return true;
}

function updateProcessingWarnings(settings: CallSettings) {
  const managed = new Set([
    "Automatic gain control may make the user extremely quiet on Linux.",
    "DeepFilter and voice isolation are enabled together.",
  ]);
  const warnings = useCall
    .getState()
    .warnings.filter((warning) => !managed.has(warning));
  if (
    /Linux/i.test(navigator.userAgent) &&
    settings.call_automatic_gain_control
  ) {
    warnings.push(
      "Automatic gain control may make the user extremely quiet on Linux.",
    );
  }
  if (
    settings.call_noise_suppression_enabled &&
    settings.call_voice_isolation
  ) {
    warnings.push("DeepFilter and voice isolation are enabled together.");
  }
  useCall.setState({ warnings });
}

async function loadCallSettings(runtime: Runtime): Promise<CallSettings> {
  const values = await Promise.all(
    callSettingKeys.map((key) => runtime.load(key)),
  );
  return Object.fromEntries(
    callSettingKeys.map((key, index) => [key, values[index]]),
  ) as CallSettings;
}

async function applyCallSettings(
  settings: CallSettings,
  previous: CallSettings,
  noiseFilter: DeepFilterNoiseFilterProcessor,
  runtime: Runtime,
) {
  const generation = ++callSettingsGeneration;
  updateProcessingWarnings(settings);
  if (callJingle) callJingle.volume = settings.call_sound_volume / 100;
  noiseFilter.setSuppressionLevel(settings.call_noise_suppression_level);
  await noiseFilter.setEnabled(settings.call_noise_suppression_enabled);
  if (generation !== callSettingsGeneration) return;

  const detector = getSpeakingDetector();
  detector.setGateEnabled(settings.call_noise_gate_enabled);
  detector.setGateThresholds(
    settings.call_mute_range_start,
    settings.call_mute_range_end,
  );

  const microphoneTrack = getRoom().localParticipant.getTrackPublication(
    Track.Source.Microphone,
  )?.track;
  if (microphoneTrack instanceof LocalAudioTrack) {
    try {
      await microphoneTrack.applyConstraints({
        noiseSuppression: false,
        echoCancellation: settings.call_echo_cancellation,
        voiceIsolation: settings.call_voice_isolation,
        autoGainControl: settings.call_automatic_gain_control,
      });
    } catch (error) {
      log(1, "call", "red", "Failed to update microphone processing", error);
      toast("error", "Failed to update microphone processing.");
      await Promise.all(
        (
          [
            "call_echo_cancellation",
            "call_voice_isolation",
            "call_automatic_gain_control",
          ] as const
        ).map((key) =>
          settings[key] === previous[key]
            ? undefined
            : runtime.save(key, previous[key]),
        ),
      );
      return;
    }
  }

  const deviceGeneration = ++microphoneDeviceGeneration;
  if (settings.call_microphone_device_id !== "default") {
    const devices = await Room.getLocalDevices("audioinput");
    if (deviceGeneration !== microphoneDeviceGeneration) return;
    const available = devices.some(
      (device) => device.deviceId === settings.call_microphone_device_id,
    );
    if (!available) {
      await runtime.save("call_microphone_device_id", "default");
      settings = { ...settings, call_microphone_device_id: "default" };
    }
  }
  if (
    settings.call_microphone_device_id !== previous.call_microphone_device_id &&
    getRoom().localParticipant.isMicrophoneEnabled &&
    getRoom().getActiveDevice("audioinput") !==
      settings.call_microphone_device_id
  ) {
    const requested = settings.call_microphone_device_id;
    latestMicrophoneDeviceId = requested;
    try {
      const switched = await getRoom().switchActiveDevice(
        "audioinput",
        requested,
      );
      if (!switched) throw new Error("Microphone switch was rejected.");
      if (deviceGeneration !== microphoneDeviceGeneration) {
        await getRoom().switchActiveDevice(
          "audioinput",
          latestMicrophoneDeviceId,
        );
        return;
      }
    } catch (error) {
      if (deviceGeneration !== microphoneDeviceGeneration) return;
      log(1, "call", "red", "Failed to switch microphone", error);
      toast("error", "Failed to switch microphone.");
      await runtime.save(
        "call_microphone_device_id",
        previous.call_microphone_device_id,
      );
      return;
    }
  }

  if (canSwitchAudioOutput() && settings.call_speaker_device_id !== "default") {
    const devices = await Room.getLocalDevices("audiooutput");
    const available = devices.some(
      (device) => device.deviceId === settings.call_speaker_device_id,
    );
    if (!available) {
      await runtime.save("call_speaker_device_id", "default");
      settings = { ...settings, call_speaker_device_id: "default" };
    }
  }
  if (
    canSwitchAudioOutput() &&
    settings.call_speaker_device_id !== previous.call_speaker_device_id &&
    getRoom().getActiveDevice("audiooutput") !== settings.call_speaker_device_id
  ) {
    const requested = settings.call_speaker_device_id;
    try {
      const switched = await getRoom().switchActiveDevice(
        "audiooutput",
        requested,
      );
      if (!switched) throw new Error("Speaker switch was rejected.");
    } catch (error) {
      log(1, "call", "red", "Failed to switch speaker", error);
      toast("error", "Failed to switch speaker.");
      await runtime.save(
        "call_speaker_device_id",
        previous.call_speaker_device_id,
      );
      return;
    }
  }

  const shareSettings: ScreenShareSettings = {
    resolution: settings.call_screen_share_resolution,
    frameRate: settings.call_screen_share_frame_rate,
    includeAudio: settings.call_screen_share_audio,
    codec: settings.call_screen_share_codec,
  };
  useCall.setState({
    screenShareExpectedCodec: await resolveScreenShareCodec(shareSettings),
  });
  try {
    await getMediaShareController().reconfigureScreen(shareSettings);
    await updateScreenShareCodecAndEncoderStatus();
  } catch (error) {
    log(1, "call", "red", "Failed to update screen share", error);
    toast("error", "Failed to update screen share settings.");
    await Promise.all(
      (
        [
          "call_screen_share_resolution",
          "call_screen_share_frame_rate",
          "call_screen_share_audio",
          "call_screen_share_codec",
        ] as const
      ).map((key) =>
        settings[key] === previous[key]
          ? undefined
          : runtime.save(key, previous[key]),
      ),
    );
    return;
  }
  currentCallSettings = settings;
}

// Connect to LiveKit, enable the microphone, and move the UI into the live call.
export async function connect(
  callId: string,
  token: string,
  callEndpoint: string,
  attemptGeneration = callAttemptGeneration,
) {
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
    .connect(callEndpoint, token, {
      autoSubscribe: false,
    })
    .catch((error) => {
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }

      useCall.setState({ state: "closed", livekitToken: null });
      log(1, "call", "red", "Failed to connect to room", error);
      toast(
        "error",
        error instanceof Error ? error.message : "Failed to connect to call.",
      );
      throw error;
    });

  if (
    attemptGeneration !== callAttemptGeneration ||
    useCall.getState().callId !== callId
  ) {
    return;
  }

  syncAllRemoteTrackSubscriptions();

  const runtime = requireRuntime(useCall.getState().runtime);
  const settings = await loadCallSettings(runtime);
  if (attemptGeneration !== callAttemptGeneration) return;
  currentCallSettings = settings;

  await getRoom()
    .localParticipant.setMicrophoneEnabled(true, {
      deviceId: settings.call_microphone_device_id,
      noiseSuppression: false,
      autoGainControl: settings.call_automatic_gain_control,
      echoCancellation: settings.call_echo_cancellation,
      voiceIsolation: settings.call_voice_isolation,
    })
    .catch((error) => {
      log(1, "call", "red", "Failed to enable microphone", error);
      toast("error", "Failed to enable microphone.");
      throw error;
    });

  if (attemptGeneration !== callAttemptGeneration) {
    await getRoom().localParticipant.setMicrophoneEnabled(false);
    return;
  }

  syncParticipantState();
}

// Tear down the active call session and return the store to a closed state.
export async function disconnect() {
  const attemptGeneration = ++callAttemptGeneration;
  stopCallJingle();
  disposeSpeakingDetector();
  await clearScreenSharePreview();
  if (attemptGeneration !== callAttemptGeneration) return;

  try {
    await getMediaShareController().clearAll();
  } catch (error) {
    log(
      1,
      "call",
      "red",
      "Failed to clear screen share during disconnect",
      error,
    );
  }
  if (attemptGeneration !== callAttemptGeneration) return;

  useCall.setState({
    state: "closing",
    invitedUserId: null,
    callId: null,
    callRoute: null,
    incomingCallInvite: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    view: "preview",
    screenShareSession: null,
    cameraSession: null,
    cameraEnabled: false,
    disabledCameraParticipantIds: [],
    focusedParticipantId: null,
    focusedParticipantType: null,
    usersInFocusedViewHidden: false,
    watchedStreamParticipantIds: [],
    pendingWatchedParticipantIds: [],
    activeScreenShareParticipantIds: [],
    callIsFullscreen: false,
    lastFocusedParticipantId: null,
  });

  getRoom().remoteParticipants.forEach((participant) => {
    participant.setVolume(1);
  });

  try {
    await getRoom().disconnect();
  } catch (error) {
    log(1, "call", "red", "Failed to disconnect from room", error);
  } finally {
    if (attemptGeneration === callAttemptGeneration) {
      useCall.setState({ state: "closed" });
      syncParticipantState();
    }
  }
}

// Leave by revoking this user's backend membership before closing local media.
export async function leaveCall() {
  callAttemptGeneration += 1;
  const runtime = requireRuntime(useCall.getState().runtime);
  const { callId } = useCall.getState();

  try {
    if (callId) {
      const ownUserId = Number(await runtime.load("user_id"));
      await runtime.callControl.request(
        callRouteOwner(),
        "CallDisconnectUser",
        {
          CallId: callId,
          UserId: ownUserId,
        },
      );
    }
  } finally {
    await disconnect();
    if (callId) {
      runtime.removeCall(callId);
    }
  }
}

export async function endCall() {
  callAttemptGeneration += 1;
  const runtime = requireRuntime(useCall.getState().runtime);
  const { callId } = useCall.getState();

  if (!callId) {
    throw new Error("Cannot end a call without an active call id.");
  }

  await runtime.callControl.request(callRouteOwner(), "EndCall", {
    CallId: callId,
  });
  await disconnect();
  runtime.removeCall(callId);
}

export async function disconnectUser(userId: number) {
  const { callId } = useCall.getState();
  if (!callId) {
    throw new Error("Cannot disconnect a user without an active call.");
  }

  await requireRuntime(useCall.getState().runtime).callControl.request(
    callRouteOwner(),
    "CallDisconnectUser",
    { CallId: callId, UserId: userId },
  );
}

export async function timeoutUser(userId: number, timeout: number) {
  const { callId } = useCall.getState();
  if (!callId) {
    throw new Error("Cannot timeout a user without an active call.");
  }

  const response = await requireRuntime(
    useCall.getState().runtime,
  ).callControl.request(callRouteOwner(), "CallTimeoutUser", {
    CallId: callId,
    UserId: userId,
    Untill: timeout,
  });
  return mtp.CallTimeoutUser.response.parse(response.data).Timeout;
}

export async function setAnonymousJoining(enabled: boolean) {
  const { callId } = useCall.getState();
  if (!callId) {
    throw new Error("Cannot change joining settings without an active call.");
  }

  const response = await requireRuntime(
    useCall.getState().runtime,
  ).callControl.request(callRouteOwner(), "CallSetAnonymousJoining", {
    CallId: callId,
    Enabled: enabled,
  });
  return mtp.CallSetAnonymousJoining.response.parse(response.data);
}

// Prepare encryption and join or create a call with another user.
export async function joinCall(
  userId: number,
  callSecret?:
    WrappedCallSecret | ProtocolCallSecret | ProtocolCallSecretResponse,
  existingCallId?: string,
  sendInvite = true,
  ownerOmikronId?: number,
) {
  const runtime = requireRuntime(useCall.getState().runtime);
  const state = useCall.getState().state;

  if (state !== "closed") {
    await leaveCall();
  }

  const attemptGeneration = ++callAttemptGeneration;
  log(2, "call", "purple", "Call creation initialised");
  const isNewCall = !callSecret && !existingCallId;
  const finalId = existingCallId || crypto.randomUUID();
  useCall.setState({
    state: "encrypting",
    invitedUserId: sendInvite && !existingCallId ? userId : null,
    callId: finalId,
    callRoute:
      ownerOmikronId != null ? { ownerOmikronId, livekitUrl: null } : null,
  });

  try {
    let creatorEnvelope: ProtocolCallSecret | undefined;

    if (callSecret) {
      if (!existingCallId) {
        throw new Error("Cannot unwrap call secret without a call id");
      }

      const wrappedCallSecret = normalizeWrappedCallSecret(callSecret);
      const decryptedSecret = await unwrapCallSecret({
        encryptedSecret: wrappedCallSecret.encryptedSecret,
        kemCiphertext: wrappedCallSecret.kemCiphertext,
        keyring: String(await runtime.load("mtp_keyring")),
        callId: existingCallId,
        secretId: wrappedCallSecret.secretId,
        version: wrappedCallSecret.versionNumber,
        wrappingScheme: wrappedCallSecret.wrappingScheme,
      });
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }

      await getKeyProvider().setKey(decryptedSecret);
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
      await getRoom().setE2EEEnabled(true);
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
      useCall.setState({ callSecret: decryptedSecret });
    } else {
      const random = randomCallSecret();

      await getKeyProvider().setKey(random);
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
      await getRoom().setE2EEEnabled(true);
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
      useCall.setState({ callSecret: random });

      const ownUserId = Number(await runtime.load("user_id"));
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
      creatorEnvelope = await wrapCallSecretForUser(ownUserId, finalId, random);
      if (attemptGeneration !== callAttemptGeneration) {
        return;
      }
    }

    const token = await getCallToken(finalId, creatorEnvelope, ownerOmikronId);
    if (attemptGeneration !== callAttemptGeneration) {
      return;
    }
    if (ownerOmikronId != null && token.OmikronId !== ownerOmikronId) {
      throw new Error(
        `Call owner mismatch: expected ${ownerOmikronId}, received ${token.OmikronId}`,
      );
    }
    if (!token.CallEndpoint) {
      throw new Error("CallToken response did not include a LiveKit endpoint.");
    }

    useCall.setState({
      view: "grid",
      callRoute: {
        ownerOmikronId: token.OmikronId,
        livekitUrl: token.CallEndpoint,
      },
      livekitToken: token.CallToken,
    });
    await openCallPage(finalId);
    if (attemptGeneration !== callAttemptGeneration) {
      return;
    }
    await connect(
      finalId,
      token.CallToken,
      token.CallEndpoint,
      attemptGeneration,
    );

    if (attemptGeneration !== callAttemptGeneration) {
      return;
    }

    if (isNewCall && sendInvite) {
      try {
        await sendCallInvite(userId);
      } catch (error) {
        toast(
          "error",
          error instanceof Error
            ? `Call invitation unavailable: ${error.message}`
            : "Call invitation unavailable.",
        );
        log(1, "call", "red", "Failed to send call invite", error);
      }
    }
  } catch (err) {
    if (attemptGeneration !== callAttemptGeneration) {
      return;
    }
    log(1, "call", "red", "Failed to join call", err);
    await disconnect();
    throw err;
  }
}

export async function receiveCallInvite(data: unknown, ownUserId: number) {
  const parsed = mtp.CallInvite.response.parse(data);
  const { CallId, CallSecret, SenderId, OmikronId } = parsed;

  if (!CallId || !CallSecret || !SenderId || OmikronId == null) {
    return;
  }
  if (SenderId === ownUserId) {
    return;
  }

  const currentCall = useCall.getState();
  if (currentCall.callId === CallId && currentCall.state !== "closed") {
    return;
  }

  useCall.setState({
    incomingCallInvite: {
      callId: CallId,
      callSecret: normalizeWrappedCallSecret(CallSecret),
      senderId: SenderId,
      ownerOmikronId: OmikronId,
    },
  });
  void startCallJingle(() => useCall.getState().incomingCallInvite != null);
}

export async function respondToCallInvite(accepted: boolean) {
  const invite = useCall.getState().incomingCallInvite;

  stopCallJingle();
  useCall.setState({ incomingCallInvite: null });

  if (!invite) {
    return;
  }
  if (!accepted) {
    log(2, "call", "purple", "Declined call invite", {
      callId: invite.callId,
      senderId: invite.senderId,
    });
    return;
  }

  const runtime = requireRuntime(useCall.getState().runtime);
  await joinCall(
    invite.senderId,
    invite.callSecret,
    invite.callId,
    false,
    invite.ownerOmikronId,
  );
  runtime.upsertCall({
    CallId: invite.callId,
    OmikronId: invite.ownerOmikronId,
    CallSecret: protocolCallSecret(invite.callSecret),
    CallMembers: [invite.senderId],
  });
}

export async function loadCallData(callId: string) {
  setCurrentCallData({ status: "loading" });

  try {
    const response = await requireRuntime(
      useCall.getState().runtime,
    ).callControl.request(callRouteOwner(), "CallData", { CallId: callId });
    const parsed = mtp.CallData.response.parse(response.data);
    setCurrentCallData({ status: "ready", userIds: parsed.UserIds });
  } catch (error) {
    if (error instanceof MTPProtocolError) {
      if (error.type === "ErrorNotFound") {
        setCurrentCallData({ status: "not-found" });
        return;
      }
      if (error.type === "ErrorNotAuthenticated") {
        setCurrentCallData({ status: "forbidden" });
        return;
      }
    }

    log(1, "call", "red", "Failed to get call data", {
      callId,
      error,
    });
    setCurrentCallData({
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to load call data.",
    });
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

export async function startScreenShare(
  request: Omit<MediaShareRequest, "kind"> = {},
) {
  await updateElectronExpectedEncoderWarning();
  const settings = await loadCallSettings(
    requireRuntime(useCall.getState().runtime),
  );
  await getMediaShareController().start({
    resolution: settings.call_screen_share_resolution,
    frameRate: settings.call_screen_share_frame_rate,
    includeAudio: settings.call_screen_share_audio,
    codec: settings.call_screen_share_codec,
    ...request,
    kind: "screen",
  });
  await publishScreenSharePreview();
}

export async function startCameraShare(sourceId?: string) {
  const settings = await loadCallSettings(
    requireRuntime(useCall.getState().runtime),
  );
  await getMediaShareController().start({
    kind: "camera",
    sourceId,
    resolution: settings.call_camera_resolution,
    frameRate: settings.call_camera_frame_rate,
  });
}

// Stop the local participant's active screen share and related previews.
export async function stopScreenShare() {
  await getMediaShareController().stop("screen");
  await clearScreenSharePreview();
  useCall.setState({ screenShareActiveCodec: null });
}

export async function stopCameraShare() {
  await getMediaShareController().stop("camera");
}

// Toggle screen sharing on or off from UI controls.
export async function setScreenShareEnabled(
  enabled: boolean,
  request: Omit<MediaShareRequest, "kind"> = {},
) {
  if (enabled) {
    await startScreenShare(request);
    return;
  }
  await stopScreenShare();
}

// Reset the in-memory call store when leaving the call experience entirely.
export function resetCallState() {
  useCall.setState({
    state: "closed",
    view: "preview",
    invitedUserId: null,
    callId: null,
    callRoute: null,
    incomingCallInvite: null,
    callSecret: null,
    livekitToken: null,
    currentCallData: null,
    deaf: false,
    cameraEnabled: false,
    screenShareSession: null,
    cameraSession: null,
    disabledCameraParticipantIds: [],
    focusedParticipantId: null,
    focusedParticipantType: null,
    usersInFocusedViewHidden: false,
    watchedStreamParticipantIds: [],
    pendingWatchedParticipantIds: [],
    activeScreenShareParticipantIds: [],
    lastFocusedParticipantId: null,
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

// Register app-level call listeners and wire React dependencies into the store.
export function useInitializeCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendCallControl, subscribe } = useMTP();
  const { load, save, subscribe: subscribeStorage } = useStorage();
  const { upsertCall, removeCall } = useSession();
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
      callControl: {
        request: (ownerOmikronId, type, data, options) =>
          sendCallControl(ownerOmikronId, type, data, options),
      },
      load,
      save,
      subscribeStorage,
      getPublicKey: (userId) =>
        get(userId, ["PublicKey"]).then((user) => user.PublicKey),
      upsertCall,
      removeCall,
    });
  }, [
    get,
    load,
    navigate,
    removeCall,
    save,
    sendCallControl,
    subscribeStorage,
    upsertCall,
  ]);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const runtime = requireRuntime(useCall.getState().runtime);

    const refresh = async () => {
      const refreshGeneration = ++generation;
      const settings = await loadCallSettings(runtime);
      if (!active || refreshGeneration !== generation) return;
      const previous = currentCallSettings;
      await applyCallSettings(settings, previous, noiseFilter, runtime);
    };

    const unsubscribe = subscribeStorage((keys, bulk) => {
      if (bulk || keys.some((key) => callSettingKeys.includes(key as never))) {
        void refresh();
      }
    });
    const onDeviceChange = () => void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);
    void refresh();

    return () => {
      active = false;
      generation += 1;
      unsubscribe();
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [noiseFilter, subscribeStorage]);

  const setInvitePopupOpen = useCallback((open: boolean) => {
    if (!open) {
      stopCallJingle();
      useCall.setState({ incomingCallInvite: null });
    }
  }, []);

  const respondToInvite = useCallback((accepted: boolean) => {
    void respondToCallInvite(accepted).catch((error) => {
      log(1, "call", "red", "Failed to join call", error);
    });
  }, []);

  // listen to call invites
  useEffect(() => {
    return subscribe("CallInvite", async ({ data }) => {
      await receiveCallInvite(data, Number(await load("user_id")));
    });
  }, [load, subscribe]);

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
      playCallEvent("call_join");
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

      log(2, "call", "purple", "Connected to call", {
        callId: useCall.getState().callId,
        callSecret: useCall.getState().callSecret,
      });
    };

    const onDisconnected = () => {
      stopCallJingle();
      playCallEvent("call_leave");
      const endedNormally = useCall.getState().state === "closing";
      useCall.setState((state) => ({
        state: "closed",
        warnings: endedNormally
          ? state.warnings.filter(
              (warning) =>
                warning !==
                "The call disconnected unexpectedly without a correct end sequence.",
            )
          : [
              ...state.warnings.filter(
                (warning) =>
                  warning !==
                  "The call disconnected unexpectedly without a correct end sequence.",
              ),
              "The call disconnected unexpectedly without a correct end sequence.",
            ],
      }));
      syncParticipantState();
      log(2, "call", "purple", "Disconnected from call", {
        callId: useCall.getState().callId,
        callSecret: useCall.getState().callSecret,
      });
    };

    const onParticipantConnected = () => {
      stopCallJingle();
      playCallEvent("call_join");
      syncAllRemoteTrackSubscriptions();
      syncParticipantState();
    };

    const onParticipantDisconnected = (participant: Participant) => {
      playCallEvent("call_leave");
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
      if (publication.source === Track.Source.ScreenShare) {
        if (!isMediaShareReconfiguring()) playCallEvent("stream_start_self");
        void updateScreenShareCodecAndEncoderStatus(publication);
        setTimeout(
          () => void updateScreenShareCodecAndEncoderStatus(publication),
          1000,
        );
      }

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
      if (publication.source === Track.Source.ScreenShare) {
        if (!isMediaShareReconfiguring()) playCallEvent("stream_end_self");
      }

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
      if (publication.source === Track.Source.ScreenShare) {
        const pendingEnd = pendingRemoteScreenShareEnds.get(
          participant.identity,
        );
        if (pendingEnd) {
          clearTimeout(pendingEnd);
          pendingRemoteScreenShareEnds.delete(participant.identity);
        } else {
          playCallEvent("stream_start_other");
        }
      }

      const participantId = getParticipantId(participant.identity);

      if (participantId != null) {
        syncRemoteParticipantTrackSubscriptions(participantId);
      }

      onParticipantStateChange();
    };

    const onTrackUnpublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (publication.source === Track.Source.ScreenShare) {
        const existing = pendingRemoteScreenShareEnds.get(participant.identity);
        if (existing) clearTimeout(existing);
        pendingRemoteScreenShareEnds.set(
          participant.identity,
          setTimeout(() => {
            pendingRemoteScreenShareEnds.delete(participant.identity);
            playCallEvent("stream_end_other");
          }, 1500),
        );
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
    room.on(RoomEvent.TrackUnpublished, onTrackUnpublished);
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
      room.off(RoomEvent.TrackUnpublished, onTrackUnpublished);
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
      for (const timeout of pendingRemoteScreenShareEnds.values()) {
        clearTimeout(timeout);
      }
      pendingRemoteScreenShareEnds.clear();
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

    void loadCallData(callId);
  }, [callId, view]);

  return incomingCallInvite ? (
    <InvitePopup
      open
      setOpen={setInvitePopupOpen}
      onAccept={respondToInvite}
      user={incomingCallInvite.senderId}
    />
  ) : null;
}
