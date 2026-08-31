import type { RefObject } from "react";
import { create } from "zustand";

import type { LocalMediaShareSession } from "./mediaShare/controller";

export type CallView = "preview" | "focused" | "grid";

export type WrappedCallSecret = {
  secretId: string;
  versionNumber: number;
  encryptedSecret: Uint8Array;
  kemCiphertext: Uint8Array;
  wrappingScheme: string;
};

export type CallRuntime = {
  navigate: (options: {
    to: string;
    search?: Record<string, unknown>;
  }) => Promise<void>;
  send: (
    type: string,
    data: Record<string, unknown>,
  ) => Promise<{ data: unknown }>;
  load: (key: string) => Promise<unknown>;
  getPublicKey: (userId: number) => Promise<string>;
};

export const useCall = create<{
  state: "closed" | "closing" | "connecting" | "open" | "encrypting";
  view: CallView;
  invitedUserId: number | null;
  callId: string | null;
  incomingCallInvite: {
    callId: string;
    callSecret: WrappedCallSecret;
    senderId: number;
  } | null;
  callSecret: string | null;
  livekitToken: string | null;
  currentCallData: { UserIds: number[]; exists: boolean } | null;
  deaf: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  screenShareSession: LocalMediaShareSession | null;
  cameraSession: LocalMediaShareSession | null;
  disabledCameraParticipantIds: number[];
  focusedParticipantId: number | null;
  focusedParticipantType: "user" | "stream" | null;
  usersInFocusedViewHidden: boolean;
  watchedStreamParticipantIds: number[];
  pendingWatchedParticipantIds: number[];
  activeScreenShareParticipantIds: number[];
  isEncrypted: boolean;
  ownCallSecretInvitePending: boolean;
  callIsFullscreen: boolean;
  callIsPopout: boolean;
  layoutVersion: number;
  screenRef: RefObject<HTMLDivElement | null> | null;
  runtime: CallRuntime | null;
  lastFocusedParticipantId: number | null;
}>(() => ({
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
  cameraEnabled: false,
  screenShareEnabled: false,
  screenShareSession: null,
  cameraSession: null,
  disabledCameraParticipantIds: [],
  focusedParticipantId: null,
  focusedParticipantType: null,
  usersInFocusedViewHidden: false,
  watchedStreamParticipantIds: [],
  pendingWatchedParticipantIds: [],
  activeScreenShareParticipantIds: [],
  isEncrypted: false,
  ownCallSecretInvitePending: false,
  callIsFullscreen: false,
  callIsPopout: false,
  layoutVersion: 0,
  screenRef: null,
  runtime: null,
  lastFocusedParticipantId: null,
}));
