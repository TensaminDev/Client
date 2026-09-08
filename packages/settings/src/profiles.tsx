import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { base64ToBytes, crypto, MTPProtocolError } from "mtp";
import { createSettingsClient, type UserBlob } from "@tensamin/mtp";
import { storageDefaults, type Storage } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import { persistMtpCredentials } from "@tensamin/storage/credentials";
import { useMTP } from "@tensamin/mtp";

const PROFILE_PREFIX = "settings-profile:";
const LEGAL_BLOB_ID = "account-setting:legal-acceptance";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const PROFILE_SALT = textEncoder.encode("tensamin-settings-profile-v1");

export const profileStorageKeys = (
  Object.keys(storageDefaults) as (keyof Storage)[]
).filter(
  (key) =>
    (key.startsWith("settings.") &&
      key !== "settings.read_confirmations" &&
      key !== "settings.receive_confirmations") ||
    key.startsWith("theme_") ||
    key.startsWith("call_mute_range_") ||
    key.startsWith("chat_picker_") ||
    [
      "cache_contacts",
      "cache_messages_per_chat",
      "chat_trusted_domains",
      "reactions",
      "hotkey_overrides",
    ].includes(key),
);

type ProfileDocument = {
  version: 1;
  id: string;
  name: string;
  settings: Partial<Storage>;
  account?: {
    userId: number;
    privateKey: string;
    domain: string | null;
  };
};

type LegalAcceptance = {
  version: 1;
  privacyPolicyHash: string;
  termsOfServiceHash: string;
  acceptedAt: number;
};

export type SettingsProfile = {
  id: string;
  name: string;
  revision: number;
  available: boolean;
  document?: ProfileDocument;
};

type ProfilesContextValue = {
  profiles: SettingsProfile[];
  activeProfile: SettingsProfile | null;
  activeProfileHasTheme: boolean;
  loading: boolean;
  error: string;
  syncError: string;
  remoteChange: "updated" | "deleted" | null;
  needsSelection: boolean;
  legalLoading: boolean;
  legalRequired: boolean;
  legalChanged: boolean;
  legalError: string;
  selectProfile(id: string): Promise<void>;
  continueLocal(): Promise<void>;
  createProfile(
    name: string,
    sourceId?: string,
    account?: { userId: number; privateKey: string; domain: string | null },
  ): Promise<void>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  retry(): Promise<void>;
  reloadRemote(): Promise<void>;
  keepLocal(): void;
  retrySave(): Promise<void>;
  retryLegal(): Promise<void>;
  acceptLegal(): Promise<void>;
  validateName(name: string, exceptId?: string): string | null;
};

const ProfilesContext = createContext<ProfilesContextValue | undefined>(
  undefined,
);

function profileKey(keyring: string) {
  return crypto.deriveEncryptionKey(
    base64ToBytes(keyring),
    PROFILE_SALT,
    textEncoder.encode("profile-document"),
  );
}

async function decryptProfile(blob: UserBlob, keyring: string) {
  const key = profileKey(keyring);
  try {
    const parsed = JSON.parse(
      textDecoder.decode(await crypto.decrypt(key, blob.ciphertext)),
    ) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as ProfileDocument).version !== 1 ||
      (parsed as ProfileDocument).id !== blob.id.slice(PROFILE_PREFIX.length) ||
      typeof (parsed as ProfileDocument).name !== "string" ||
      typeof (parsed as ProfileDocument).settings !== "object"
    ) {
      throw new Error("Unsupported profile document");
    }
    const raw = parsed as ProfileDocument;
    if (
      raw.account !== undefined &&
      (typeof raw.account !== "object" ||
        !Number.isSafeInteger(raw.account.userId) ||
        raw.account.userId <= 0 ||
        typeof raw.account.privateKey !== "string" ||
        !raw.account.privateKey ||
        (raw.account.domain !== null && typeof raw.account.domain !== "string"))
    ) {
      throw new Error("Unsupported profile account");
    }
    const settings = Object.fromEntries(
      Object.entries(raw.settings).filter(([key, value]) => {
        if (!profileStorageKeys.includes(key as keyof Storage)) return false;
        const defaultValue = storageDefaults[key as keyof Storage];
        if (defaultValue === null)
          return value === null || typeof value === "object";
        if (Array.isArray(defaultValue)) return Array.isArray(value);
        return typeof value === typeof defaultValue;
      }),
    ) as Partial<Storage>;
    const document = { ...raw, settings };
    return {
      id: document.id,
      name: document.name,
      revision: blob.revision,
      available: true,
      document,
    } satisfies SettingsProfile;
  } finally {
    key.fill(0);
  }
}

async function encryptProfile(document: ProfileDocument, keyring: string) {
  const key = profileKey(keyring);
  try {
    return await crypto.encrypt(
      key,
      textEncoder.encode(JSON.stringify(document)),
    );
  } finally {
    key.fill(0);
  }
}

async function fetchLegalHash(document: string) {
  const response = await fetch(
    `https://legal.methanium.net/tensamin/${document}/raw`,
  );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("text/plain")
  )
    throw new Error(`Could not load ${document}`);
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await response.arrayBuffer(),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function encryptLegal(value: LegalAcceptance, keyring: string) {
  const key = profileKey(keyring);
  try {
    return await crypto.encrypt(key, textEncoder.encode(JSON.stringify(value)));
  } finally {
    key.fill(0);
  }
}

async function decryptLegal(blob: UserBlob, keyring: string) {
  const key = profileKey(keyring);
  try {
    const value = JSON.parse(
      textDecoder.decode(await crypto.decrypt(key, blob.ciphertext)),
    ) as LegalAcceptance;
    if (
      value.version !== 1 ||
      typeof value.privacyPolicyHash !== "string" ||
      typeof value.termsOfServiceHash !== "string" ||
      typeof value.acceptedAt !== "number"
    )
      throw new Error("Unsupported legal acceptance record");
    return value;
  } finally {
    key.fill(0);
  }
}

export function SettingsProfilesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const storage = useStorage();
  const { send, subscribe, identified, clientState } = useMTP();
  const client = useMemo(
    () => createSettingsClient({ send, subscribe, clientState }),
    [clientState, send, subscribe],
  );
  const [profiles, setProfiles] = useState<SettingsProfile[]>([]);
  const profilesRef = useRef(profiles);
  const [activeId, setActiveId] = useState("");
  const activeIdRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [remoteChange, setRemoteChange] = useState<
    "updated" | "deleted" | null
  >(null);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalRequired, setLegalRequired] = useState(false);
  const [legalChanged, setLegalChanged] = useState(false);
  const [legalError, setLegalError] = useState("");
  const legalHashes = useRef({ privacyPolicyHash: "", termsOfServiceHash: "" });
  const legalRevision = useRef(0);
  const keyringRef = useRef("");
  const applying = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const saveQueue = useRef(Promise.resolve());
  const pendingRemote = useRef<SettingsProfile | null>(null);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const readSettings = useCallback(async () => {
    const entries = await Promise.all(
      profileStorageKeys.map(
        async (key) => [key, await storage.load(key)] as const,
      ),
    );
    return Object.fromEntries(entries) as Partial<Storage>;
  }, [storage]);

  const persistDocument = useCallback(
    async (
      profile: SettingsProfile,
      document: ProfileDocument,
      reason: string,
    ) => {
      const ciphertext = await encryptProfile(document, keyringRef.current);
      const saved = await client.updateBlob(
        PROFILE_PREFIX + profile.id,
        ciphertext,
        profile.revision,
        { reason, value: document },
      );
      const update = (current: SettingsProfile[]) =>
        current.map((item) =>
          item.id === profile.id
            ? {
                ...item,
                document,
                name: document.name,
                revision: saved.revision,
              }
            : item,
        );
      profilesRef.current = update(profilesRef.current);
      setProfiles(update);
      if (profile.id === activeIdRef.current) setRemoteChange(null);
      setSyncError("");
    },
    [client],
  );

  const saveActive = useCallback(async () => {
    const profile = profilesRef.current.find(
      (item) => item.id === activeIdRef.current && item.available,
    );
    if (!profile?.document) return;
    const settings = await readSettings();
    try {
      await persistDocument(
        profile,
        { ...profile.document, settings },
        "settings changed",
      );
    } catch (caught) {
      setSyncError(
        caught instanceof Error
          ? caught.message
          : "Profile synchronization failed",
      );
    }
  }, [persistDocument, readSettings]);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      saveQueue.current = saveQueue.current.then(saveActive);
    }
    await saveQueue.current;
  }, [saveActive]);

  useEffect(
    () =>
      storage.subscribe((keys) => {
        if (
          applying.current ||
          !activeIdRef.current ||
          !keys.some((key) => profileStorageKeys.includes(key))
        )
          return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveTimer.current = undefined;
          saveQueue.current = saveQueue.current.then(saveActive);
        }, 300);
      }),
    [saveActive, storage],
  );

  const validateName = useCallback((name: string, exceptId?: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 64)
      return "Profile names must contain 1 to 64 characters.";
    if (
      profilesRef.current.some(
        (profile) =>
          profile.id !== exceptId &&
          profile.name.localeCompare(trimmed, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    )
      return "Profile names must be unique.";
    return null;
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!identified) return;
    setLoading(true);
    setError("");
    try {
      const [keyring, selectedId, sessionId, promptedSessionId, blobs] =
        await Promise.all([
          storage.load("mtp_keyring"),
          storage.load("active_settings_profile_id"),
          storage.load("session_id"),
          storage.load("settings_profile_prompted_session_id"),
          client.listBlobs(),
        ]);
      keyringRef.current = keyring;
      const relevant = blobs.filter((item) =>
        item.id.startsWith(PROFILE_PREFIX),
      );
      const decoded = await Promise.all(
        relevant.map(async (item) => {
          try {
            return await decryptProfile(
              item.ciphertext
                ? (item as UserBlob)
                : await client.getBlob(item.id),
              keyring,
            );
          } catch {
            return {
              id: item.id.slice(PROFILE_PREFIX.length),
              name: "Unavailable profile",
              revision: item.revision,
              available: false,
            } satisfies SettingsProfile;
          }
        }),
      );
      let next = decoded;
      if (next.length === 0) {
        const id = globalThis.crypto.randomUUID();
        const document: ProfileDocument = {
          version: 1,
          id,
          name: "Default",
          settings: await readSettings(),
        };
        const created = await client.createBlob(
          PROFILE_PREFIX + id,
          await encryptProfile(document, keyring),
          { reason: "default profile created", value: document },
        );
        next = [
          {
            id,
            name: document.name,
            revision: created.revision,
            available: true,
            document,
          },
        ];
      }
      setProfiles(next);
      const selected = next.find(
        (profile) => profile.id === selectedId && profile.available,
      );
      const nextId =
        selected?.id ?? next.find((profile) => profile.available)?.id ?? "";
      setActiveId(nextId);
      await storage.save("active_settings_profile_id", nextId);
      setNeedsSelection(sessionId !== promptedSessionId);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load profiles",
      );
      setNeedsSelection(true);
    } finally {
      setLoading(false);
    }
  }, [client, identified, readSettings, storage]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const loadLegal = useCallback(async () => {
    if (!identified) return;
    setLegalLoading(true);
    setLegalError("");
    try {
      const [keyring, privacyPolicyHash, termsOfServiceHash, blobs] =
        await Promise.all([
          storage.load("mtp_keyring"),
          fetchLegalHash("privacy-policy"),
          fetchLegalHash("terms-of-service"),
          client.listBlobs(),
        ]);
      legalHashes.current = { privacyPolicyHash, termsOfServiceHash };
      try {
        const metadata = blobs.find((item) => item.id === LEGAL_BLOB_ID);
        if (!metadata) {
          legalRevision.current = 0;
          setLegalChanged(false);
          setLegalRequired(true);
          return;
        }
        const blob = metadata.ciphertext
          ? (metadata as UserBlob)
          : await client.getBlob(LEGAL_BLOB_ID);
        const acceptance = await decryptLegal(blob, keyring);
        legalRevision.current = blob.revision;
        const changed =
          acceptance.privacyPolicyHash !== privacyPolicyHash ||
          acceptance.termsOfServiceHash !== termsOfServiceHash;
        setLegalChanged(changed);
        setLegalRequired(changed);
      } catch (caught) {
        if (
          caught instanceof MTPProtocolError &&
          caught.type === "ErrorNotFound"
        ) {
          legalRevision.current = 0;
          setLegalChanged(false);
          setLegalRequired(true);
        } else {
          throw caught;
        }
      }
    } catch (caught) {
      setLegalError(
        caught instanceof Error
          ? caught.message
          : "Failed to load legal documents",
      );
      setLegalRequired(true);
    } finally {
      setLegalLoading(false);
    }
  }, [client, identified, storage]);

  useEffect(() => {
    void loadLegal();
  }, [loadLegal]);

  const acceptLegal = useCallback(async () => {
    const keyring = await storage.load("mtp_keyring");
    const acceptance: LegalAcceptance = {
      version: 1,
      ...legalHashes.current,
      acceptedAt: Date.now(),
    };
    const ciphertext = await encryptLegal(acceptance, keyring);
    const saved = legalRevision.current
      ? await client.updateBlob(
          LEGAL_BLOB_ID,
          ciphertext,
          legalRevision.current,
          { reason: "legal documents accepted", value: acceptance },
        )
      : await client.createBlob(LEGAL_BLOB_ID, ciphertext, {
          reason: "legal documents accepted",
          value: acceptance,
        });
    legalRevision.current = saved.revision;
    setLegalRequired(false);
    setLegalChanged(false);
  }, [client, storage]);

  const markSelected = useCallback(async () => {
    await storage.save(
      "settings_profile_prompted_session_id",
      await storage.load("session_id"),
    );
    setNeedsSelection(false);
  }, [storage]);

  const selectProfile = useCallback(
    async (id: string) => {
      const profile = profilesRef.current.find(
        (item) => item.id === id && item.available,
      );
      if (!profile?.document) throw new Error("Profile is unavailable");
      await flush();
      applying.current = true;
      try {
        await storage.apply(profile.document.settings);
        await storage.save("active_settings_profile_id", id);
        setActiveId(id);
        await markSelected();
        setRemoteChange(null);
        setSyncError("");
        if (profile.document.account) {
          const [userId, keyring] = await Promise.all([
            storage.load("user_id"),
            storage.load("mtp_keyring"),
          ]);
          if (
            userId !== profile.document.account.userId ||
            keyring !== profile.document.account.privateKey
          ) {
            await persistMtpCredentials({
              storage,
              userId: profile.document.account.userId,
              keyring: profile.document.account.privateKey,
              domain: profile.document.account.domain,
            });
            globalThis.location.reload();
          }
        }
      } finally {
        applying.current = false;
      }
    },
    [flush, markSelected, storage],
  );

  const continueLocal = useCallback(async () => {
    setActiveId("");
    await storage.save("active_settings_profile_id", "");
    await markSelected();
  }, [markSelected, storage]);

  const createProfile = useCallback(
    async (
      name: string,
      sourceId?: string,
      account?: { userId: number; privateKey: string; domain: string | null },
    ) => {
      const trimmed = name.trim();
      const validation = validateName(trimmed);
      if (validation) throw new Error(validation);
      await flush();
      const source = profilesRef.current.find(
        (profile) => profile.id === sourceId,
      );
      const id = globalThis.crypto.randomUUID();
      const document: ProfileDocument = {
        version: 1,
        id,
        name: trimmed,
        settings: source?.document?.settings ?? (await readSettings()),
        ...(account ? { account } : {}),
      };
      const created = await client.createBlob(
        PROFILE_PREFIX + id,
        await encryptProfile(document, keyringRef.current),
        { reason: "profile created", value: document },
      );
      const profile = {
        id,
        name: trimmed,
        revision: created.revision,
        available: true,
        document,
      } satisfies SettingsProfile;
      setProfiles((current) => [...current, profile]);
      profilesRef.current = [...profilesRef.current, profile];
      await selectProfile(id);
    },
    [client, flush, readSettings, selectProfile, validateName],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      const profile = profilesRef.current.find((item) => item.id === id);
      const trimmed = name.trim();
      const validation = validateName(trimmed, id);
      if (validation) throw new Error(validation);
      if (!profile?.document) throw new Error("Profile is unavailable");
      await flush();
      await persistDocument(
        profile,
        { ...profile.document, name: trimmed },
        "profile renamed",
      );
    },
    [flush, persistDocument, validateName],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      const profile = profilesRef.current.find((item) => item.id === id);
      if (!profile) return;
      await flush();
      await client.deleteBlob(PROFILE_PREFIX + id, profile.revision);
      const remaining = profilesRef.current.filter((item) => item.id !== id);
      setProfiles(remaining);
      profilesRef.current = remaining;
      if (id !== activeIdRef.current) return;
      const fallback = remaining.find((item) => item.available);
      if (fallback) await selectProfile(fallback.id);
      else await createProfile("Default");
    },
    [client, createProfile, flush, selectProfile],
  );

  const reloadRemote = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return loadProfiles();
    if (remoteChange === "deleted") {
      const remaining = profilesRef.current.filter(
        (profile) => profile.id !== id,
      );
      setProfiles(remaining);
      profilesRef.current = remaining;
      const fallback = remaining.find((profile) => profile.available);
      if (fallback) await selectProfile(fallback.id);
      else await createProfile("Default");
      setRemoteChange(null);
      return;
    }
    const decoded =
      pendingRemote.current ??
      (await decryptProfile(
        await client.getBlob(PROFILE_PREFIX + id),
        keyringRef.current,
      ));
    pendingRemote.current = null;
    setProfiles((current) =>
      current.map((profile) => (profile.id === id ? decoded : profile)),
    );
    profilesRef.current = profilesRef.current.map((profile) =>
      profile.id === id ? decoded : profile,
    );
    await selectProfile(id);
  }, [client, createProfile, loadProfiles, remoteChange, selectProfile]);

  useEffect(
    () =>
      client.subscribeBlobChanges(async (event) => {
        if (event.id !== PROFILE_PREFIX + activeIdRef.current) return;
        const known = profilesRef.current.find(
          (profile) => profile.id === activeIdRef.current,
        )?.revision;
        if (known !== undefined && event.revision <= known) return;
        if (event.deleted) {
          pendingRemote.current = null;
          setRemoteChange("deleted");
          return;
        }
        try {
          const remote = await decryptProfile(
            {
              id: event.id,
              ciphertext: event.ciphertext,
              revision: event.revision,
              updatedAt: event.updatedAt,
            },
            keyringRef.current,
          );
          const localSettings = await readSettings();
          const current = profilesRef.current.find(
            (profile) => profile.id === activeIdRef.current,
          );
          if (
            current?.name === remote.name &&
            JSON.stringify(localSettings) ===
              JSON.stringify(remote.document?.settings)
          ) {
            profilesRef.current = profilesRef.current.map((profile) =>
              profile.id === remote.id ? remote : profile,
            );
            setProfiles(profilesRef.current);
            setRemoteChange(null);
            return;
          }
          pendingRemote.current = remote;
          setRemoteChange("updated");
        } catch (caught) {
          setSyncError(
            caught instanceof Error
              ? caught.message
              : "Failed to compare the remote profile",
          );
        }
      }),
    [client, readSettings],
  );

  useEffect(
    () =>
      client.subscribeBlobChanges(async (event) => {
        if (
          event.id !== LEGAL_BLOB_ID ||
          event.revision <= legalRevision.current
        )
          return;
        if (event.deleted) {
          legalRevision.current = 0;
          setLegalChanged(false);
          setLegalRequired(true);
          return;
        }
        try {
          const acceptance = await decryptLegal(
            {
              id: event.id,
              ciphertext: event.ciphertext,
              revision: event.revision,
              updatedAt: event.updatedAt,
            },
            keyringRef.current,
          );
          legalRevision.current = event.revision;
          const changed =
            acceptance.privacyPolicyHash !==
              legalHashes.current.privacyPolicyHash ||
            acceptance.termsOfServiceHash !==
              legalHashes.current.termsOfServiceHash;
          setLegalChanged(changed);
          setLegalRequired(changed);
          setLegalError("");
        } catch (caught) {
          setLegalError(
            caught instanceof Error
              ? caught.message
              : "Failed to apply legal acceptance",
          );
        }
      }),
    [client],
  );

  useEffect(() => {
    if (!identified) return;
    void client.getReceiptPolicy().then(async (value) => {
      applying.current = true;
      await storage.apply({
        "settings.read_confirmations": value.sendReadReceipts,
        "settings.receive_confirmations": value.sendReceivedReceipts,
      });
      applying.current = false;
    });
    const unsubscribeStorage = storage.subscribe((keys) => {
      if (
        applying.current ||
        !keys.some(
          (key) =>
            key === "settings.read_confirmations" ||
            key === "settings.receive_confirmations",
        )
      )
        return;
      void Promise.all([
        storage.load("settings.read_confirmations"),
        storage.load("settings.receive_confirmations"),
      ]).then(([sendReadReceipts, sendReceivedReceipts]) => {
        return client.setReceiptPolicy({
          sendReadReceipts,
          sendReceivedReceipts,
        });
      });
    });
    const unsubscribePolicy = client.subscribeReceiptPolicy((value) => {
      applying.current = true;
      void storage
        .apply({
          "settings.read_confirmations": value.sendReadReceipts,
          "settings.receive_confirmations": value.sendReceivedReceipts,
        })
        .finally(() => {
          applying.current = false;
        });
    });
    return () => {
      unsubscribeStorage();
      unsubscribePolicy();
    };
  }, [client, identified, storage]);

  const value = useMemo<ProfilesContextValue>(
    () => ({
      profiles,
      activeProfile:
        profiles.find((profile) => profile.id === activeId) ?? null,
      activeProfileHasTheme: Boolean(
        profiles.find((profile) => profile.id === activeId)?.document?.settings
          .theme_parent,
      ),
      loading,
      error,
      syncError,
      remoteChange,
      needsSelection,
      legalLoading,
      legalRequired,
      legalChanged,
      legalError,
      selectProfile,
      continueLocal,
      createProfile,
      renameProfile,
      deleteProfile,
      retry: loadProfiles,
      reloadRemote,
      keepLocal: () => {
        const remote = pendingRemote.current;
        if (remote) {
          profilesRef.current = profilesRef.current.map((profile) =>
            profile.id === remote.id
              ? { ...profile, revision: remote.revision }
              : profile,
          );
          setProfiles(profilesRef.current);
          pendingRemote.current = null;
          void saveActive();
        }
        setRemoteChange(null);
      },
      retrySave: saveActive,
      retryLegal: loadLegal,
      acceptLegal,
      validateName,
    }),
    [
      activeId,
      continueLocal,
      createProfile,
      deleteProfile,
      error,
      acceptLegal,
      legalChanged,
      legalError,
      legalLoading,
      legalRequired,
      loadLegal,
      loadProfiles,
      loading,
      needsSelection,
      profiles,
      reloadRemote,
      remoteChange,
      renameProfile,
      saveActive,
      selectProfile,
      syncError,
      validateName,
    ],
  );

  return (
    <ProfilesContext.Provider value={value}>
      {children}
    </ProfilesContext.Provider>
  );
}

export function useSettingsProfiles() {
  const context = useContext(ProfilesContext);
  if (!context)
    throw new Error("useSettingsProfiles requires SettingsProfilesProvider");
  return context;
}
