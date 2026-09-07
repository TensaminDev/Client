import { beforeEach, describe, expect, it, vi } from "vitest";
import { MTPProtocolError, type MTPFrame } from "mtp";

import type { CallControlTransport, CallRuntime } from "./state";

const mocks = vi.hoisted(() => {
  vi.stubGlobal(
    "Worker",
    class {
      terminate() {}
    },
  );
  const localParticipant = {
    identity: "1",
    isE2EEEnabled: true,
    isEncrypted: true,
    isMicrophoneEnabled: false,
    isScreenShareEnabled: false,
    trackPublications: new Map(),
    setAttributes: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
  };
  const room = {
    metadata: "",
    localParticipant,
    remoteParticipants: new Map(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    off: vi.fn(),
    on: vi.fn(),
    setE2EEEnabled: vi.fn(async () => undefined),
  };

  return {
    keyProviderSetKey: vi.fn(async () => undefined),
    room,
    unwrapCallSecret: vi.fn(async () => "decrypted-secret"),
    wrapCallSecret: vi.fn(async () => ({
      encryptedSecret: new Uint8Array([1]),
      kemCiphertext: new Uint8Array([2]),
      wrappingScheme: "test-scheme",
    })),
  };
});

vi.mock("livekit-client", () => ({
  ExternalE2EEKeyProvider: class {
    setKey = mocks.keyProviderSetKey;
  },
  LocalAudioTrack: class {},
  Room: class {
    constructor() {
      return mocks.room;
    }
  },
  RoomEvent: new Proxy({}, { get: (_, key) => String(key) }),
  Track: {
    Kind: { Audio: "audio", Video: "video" },
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
      ScreenShareAudio: "screen_share_audio",
    },
  },
  getLogger: vi.fn(),
  setLogExtension: vi.fn(),
}));

vi.mock("deepfilternet3-noise-filter", () => ({
  DeepFilterNoiseFilterProcessor: class {},
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock("@tensamin/mtp", () => ({ useMTP: vi.fn() }));
vi.mock("@tensamin/storage/context", () => ({ useStorage: vi.fn() }));
vi.mock("@tensamin/identity/session", () => ({ useSession: vi.fn() }));
vi.mock("@tensamin/identity/context", () => ({ useUser: vi.fn() }));

vi.mock("@tensamin/crypto/callSecret", () => ({
  deriveCallSecretId: (callId: string) => `call:${callId}:main`,
  kemPublicKeyFromPublicKeyBundle: () => new Uint8Array([3]),
  unwrapCallSecret: mocks.unwrapCallSecret,
  wrapCallSecret: mocks.wrapCallSecret,
}));

vi.mock("@tensamin/shared/log", () => ({
  log: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tensamin/shared/sounds", () => ({
  playSound: vi.fn(() => null),
  stopSound: vi.fn(),
}));

vi.mock("./components/invitePopup", () => ({ default: () => null }));

import {
  disconnect,
  endCall,
  joinCall,
  leaveCall,
  loadCallData,
  receiveCallInvite,
  respondToCallInvite,
  sendCallInvite,
  useCall,
} from "./store";

function runtimeWith(
  request: ReturnType<typeof vi.fn>,
  overrides: Partial<CallRuntime> = {},
): CallRuntime {
  return {
    navigate: vi.fn(async () => undefined),
    callControl: {
      request: request as CallControlTransport["request"],
    },
    load: vi.fn(async (key: string) => (key === "user_id" ? 1 : "setting")),
    getPublicKey: vi.fn(async () => "public-key"),
    upsertCall: vi.fn(),
    removeCall: vi.fn(),
    ...overrides,
  };
}

function callToken() {
  return {
    type: "CallToken",
    data: {
      CallToken: "livekit-token",
      CallEndpoint: "wss://owner.example.test",
      OmikronId: 7,
    },
  };
}

describe("call lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCall.setState(useCall.getInitialState(), true);
    mocks.room.localParticipant.isMicrophoneEnabled = false;
  });

  it("creates a call with a creator envelope and no self-invite", async () => {
    const request = vi.fn(async (...args: [string, unknown?]) =>
      args[0] === "CallToken" ? callToken() : { type: "Success", data: {} },
    );
    useCall.setState({ runtime: runtimeWith(request) });

    await joinCall(2);

    const tokenRequest = request.mock.calls.find(
      ([type]) => type === "CallToken",
    );
    expect(tokenRequest?.[1]).toEqual(
      expect.objectContaining({ CallSecret: expect.anything() }),
    );
    expect(request).toHaveBeenCalledWith(
      "CallInvite",
      expect.objectContaining({ ReceiverId: 2 }),
    );
    expect(request).not.toHaveBeenCalledWith(
      "CallInvite",
      expect.objectContaining({ ReceiverId: 1 }),
    );
    expect(mocks.room.connect).toHaveBeenCalledWith(
      "wss://owner.example.test",
      "livekit-token",
      { autoSubscribe: false },
    );
  });

  it("retains the invitation owner and does not persist a decline", async () => {
    const request = vi.fn();
    const runtime = runtimeWith(request);
    useCall.setState({ runtime });

    await receiveCallInvite(
      {
        CallId: "call-id",
        CallSecret: {
          SecretId: "secret-id",
          VersionNumber: 1,
          EncryptedSecret: new Uint8Array([1]),
          KemCiphertext: new Uint8Array([2]),
          WrappingScheme: "test-scheme",
        },
        SenderId: 2,
        OmikronId: 9,
      },
      1,
    );

    expect(useCall.getState().incomingCallInvite?.ownerOmikronId).toBe(9);
    await respondToCallInvite(false);
    expect(runtime.upsertCall).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("ignores an invitation without an owner route", async () => {
    useCall.setState({ runtime: runtimeWith(vi.fn()) });

    await receiveCallInvite(
      {
        CallId: "call-id",
        CallSecret: {
          SecretId: "secret-id",
          VersionNumber: 1,
          EncryptedSecret: new Uint8Array([1]),
          KemCiphertext: new Uint8Array([2]),
          WrappingScheme: "test-scheme",
        },
        SenderId: 2,
      },
      1,
    );

    expect(useCall.getState().incomingCallInvite).toBeNull();
  });

  it("accepts with a token request that has no creator secret", async () => {
    const request = vi.fn(async () => callToken());
    const runtime = runtimeWith(request);
    useCall.setState({
      runtime,
      incomingCallInvite: {
        callId: "call-id",
        callSecret: {
          secretId: "secret-id",
          versionNumber: 1,
          encryptedSecret: new Uint8Array([1]),
          kemCiphertext: new Uint8Array([2]),
          wrappingScheme: "test-scheme",
        },
        senderId: 2,
        ownerOmikronId: 7,
      },
    });

    await respondToCallInvite(true);

    expect(request).toHaveBeenCalledWith("CallToken", { CallId: "call-id" });
    expect(runtime.upsertCall).toHaveBeenCalledOnce();
  });

  it("cleans call setup state when CallToken fails", async () => {
    const request = vi.fn(async () => {
      throw new Error("token failed");
    });
    useCall.setState({ runtime: runtimeWith(request) });

    await expect(joinCall(2)).rejects.toThrow("token failed");
    expect(useCall.getState()).toMatchObject({
      state: "closed",
      callId: null,
      callRoute: null,
      callSecret: null,
      livekitToken: null,
      invitedUserId: null,
      currentCallData: null,
    });
  });

  it("keeps a connected call when an invitation fails", async () => {
    const request = vi.fn(async () => {
      throw new Error("invite failed");
    });
    useCall.setState({
      runtime: runtimeWith(request),
      state: "open",
      callId: "call-id",
      callSecret: "secret",
    });

    await expect(sendCallInvite(2)).rejects.toThrow("invite failed");
    expect(useCall.getState()).toMatchObject({
      state: "open",
      callId: "call-id",
      invitedUserId: null,
    });
  });

  it.each([
    ["ErrorNotFound", "not-found"],
    ["ErrorNotAuthenticated", "forbidden"],
  ] as const)("maps %s CallData responses", async (type, status) => {
    const request = vi.fn(async () => {
      throw new MTPProtocolError({ type, data: {} } as MTPFrame);
    });
    useCall.setState({ runtime: runtimeWith(request) });

    await loadCallData("call-id");
    expect(useCall.getState().currentCallData).toEqual({ status });
  });

  it("revokes membership on explicit leave", async () => {
    const request = vi.fn(async () => ({ type: "Success", data: {} }));
    const runtime = runtimeWith(request);
    useCall.setState({ runtime, state: "open", callId: "call-id" });

    await leaveCall();

    expect(request).toHaveBeenCalledWith("CallDisconnectUser", {
      CallId: "call-id",
      UserId: 1,
    });
    expect(runtime.removeCall).toHaveBeenCalledWith("call-id");
  });

  it("does not revoke membership for a media disconnect", async () => {
    const request = vi.fn();
    useCall.setState({
      runtime: runtimeWith(request),
      state: "open",
      callId: "call-id",
    });

    await disconnect();
    expect(request).not.toHaveBeenCalled();
  });

  it("ends the backend call and clears local state", async () => {
    const request = vi.fn(async () => ({ type: "Success", data: {} }));
    const runtime = runtimeWith(request);
    useCall.setState({ runtime, state: "open", callId: "call-id" });

    await endCall();

    expect(request).toHaveBeenCalledWith("EndCall", { CallId: "call-id" });
    expect(runtime.removeCall).toHaveBeenCalledWith("call-id");
    expect(useCall.getState().state).toBe("closed");
  });
});
