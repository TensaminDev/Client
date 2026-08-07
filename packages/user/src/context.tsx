import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMTP, type ProtocolMessage } from "@tensamin/mtp";

import {
  clientUserStateSchema,
  mtp as schemas,
  publicUserStateSchema,
  userStateEntrySchema,
} from "@tensamin/shared/data";
import type z from "zod";
import { createCache } from "@tensamin/cache";
import { useStorage } from "@tensamin/storage/context";
import { useSession } from "@tensamin/storage/session";

export type User = z.infer<typeof schemas.GetUserData.response>;
type ClientUserState = z.infer<typeof clientUserStateSchema>;

export function mergeTransientPresence<T extends { UserId: number }>(
  user: T,
  presence: ReadonlyMap<number, ClientUserState>,
): T {
  const state = presence.get(user.UserId);
  return state === undefined ? user : ({ ...user, OnlineStatus: state } as T);
}

const USER_CACHE_MAX_AGE = 5 * 60 * 1000;

interface contextValue {
  get(userId: number): Promise<User>;
  update(user: User): Promise<void>;
}

const UserContext = createContext<contextValue | undefined>(undefined);

/**
 * Executes UserProvider.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function UserProvider(props: { children: ReactNode }) {
  const storageRef = useRef<Record<number, User>>({});
  const pendingRef = useRef<Record<number, Promise<User> | undefined>>({});
  const checkedAtRef = useRef<Record<number, number>>({});
  const presenceRef = useRef(new Map<number, ClientUserState>());
  const durableProfileRef = useRef<Record<number, User>>({});

  const { send, subscribePush } = useMTP();
  const { load } = useStorage();
  const { contacts } = useSession();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const contactsRef = useRef(contacts);
  const initialStatesRef = useRef(
    new Map<number, z.infer<typeof publicUserStateSchema>>(),
  );

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const mergeUserPresence = useCallback((user: User): User => {
    return mergeTransientPresence(user, presenceRef.current);
  }, []);

  const applyUserState = useCallback(
    (userId: number, state: ClientUserState, privateState = false) => {
      const known =
        userId === accountId ||
        contactsRef.current.some((contact) => contact.UserId === userId);
      if (!known) return false;

      if (state === "user_invisible" && userId !== accountId) return false;
      if (userId === accountId && !privateState) return false;

      presenceRef.current.set(userId, state);
      const current = storageRef.current[userId];
      if (current) storageRef.current[userId] = mergeUserPresence(current);
      setCacheVersion((version) => version + 1);
      return true;
    },
    [accountId, mergeUserPresence],
  );

  const removePresence = useCallback((userId: number) => {
    presenceRef.current.delete(userId);
    initialStatesRef.current.delete(userId);
    delete checkedAtRef.current[userId];
    setCacheVersion((version) => version + 1);
  }, []);

  const handleStatePush = useCallback(
    async (message: ProtocolMessage) => {
      if (!accountId || !sessionId) return;
      const data = message.data as Record<string, unknown>;
      if (message.type === "GetStates") {
        if (Number(data.SessionId) !== sessionId) {
          return;
        }
        if (Array.isArray(data.MissingUserIds)) {
          for (const userId of data.MissingUserIds) {
            if (typeof userId === "number") removePresence(userId);
          }
        }
        if (!Array.isArray(data.UserStates)) return;
        for (const entry of data.UserStates) {
          const parsed = userStateEntrySchema.safeParse(entry);
          if (!parsed.success) continue;
          if (parsed.data.UserId === accountId) continue;
          initialStatesRef.current.set(
            parsed.data.UserId,
            parsed.data.UserState,
          );
          if (applyUserState(parsed.data.UserId, parsed.data.UserState)) {
            initialStatesRef.current.delete(parsed.data.UserId);
          }
        }
        return;
      }
      if (message.type !== "ClientChanged") return;
      if (Number(data.SessionId) !== sessionId) return;
      const parsed = schemas.ClientChanged.response.safeParse(data);
      if (!parsed.success) return;
      applyUserState(parsed.data.UserId, parsed.data.UserState, true);
    },
    [accountId, applyUserState, removePresence, sessionId],
  );

  useEffect(() => {
    void load("user_id").then((accountId) => {
      setAccountId(accountId);
    });
    void load("session_id").then((value) => {
      setSessionId(value);
    });
  }, [load]);

  useEffect(() => {
    if (!accountId || !sessionId) return;
    return subscribePush(handleStatePush);
  }, [accountId, handleStatePush, sessionId, subscribePush]);

  /**
   * Executes get.
   * @param userId Parameter userId.
   * @returns Promise<User>.
   */
  const get = useCallback(
    async (userId: number): Promise<User> => {
      void cacheVersion;
      if (userId == null) {
        throw new Error("userId is required");
      }

      const pendingUser = pendingRef.current[userId];
      if (pendingUser !== undefined) {
        return pendingUser;
      }

      const request = (async () => {
        const cache = createCache(String(accountId ?? userId));
        const cachedValue =
          storageRef.current[userId] ?? (await cache.profiles.get(userId));
        const cachedResult =
          schemas.GetUserData.response.safeParse(cachedValue);
        const cached = cachedResult.success ? cachedResult.data : undefined;
        if (cached) {
          durableProfileRef.current[userId] = cached;
          const merged = mergeUserPresence(cached);
          storageRef.current[userId] = merged;
          const checkedAt = checkedAtRef.current[userId];
          if (!checkedAt || Date.now() - checkedAt < USER_CACHE_MAX_AGE) {
            checkedAtRef.current[userId] = Date.now();
            return merged;
          }
        }
        try {
          const userData = await send("GetUserData", { UserId: userId });
          if (userData.type === "ErrorNotFound" || userData.data.UserId === 0) {
            delete storageRef.current[userId];
            delete durableProfileRef.current[userId];
            delete checkedAtRef.current[userId];
            await cache.profiles.delete(userId);
            throw new Error("GetUserData failed: user not found");
          }
          if (userData.type.startsWith("Error")) {
            throw new Error(`GetUserData failed: ${userData.type}`);
          }
          const user = mergeUserPresence(userData.data);
          durableProfileRef.current[userId] = userData.data;
          storageRef.current[userId] = user;
          checkedAtRef.current[userId] = Date.now();
          return user;
        } catch (error) {
          if (cached && storageRef.current[userId]) {
            checkedAtRef.current[userId] = Date.now();
            return storageRef.current[userId];
          }
          throw error;
        }
      })();

      pendingRef.current[userId] = request;

      try {
        return await request;
      } finally {
        delete pendingRef.current[userId];
      }
    },
    [accountId, cacheVersion, mergeUserPresence, send],
  );

  const update = useCallback(
    async (user: User) => {
      const durableProfile = {
        ...user,
        OnlineStatus:
          durableProfileRef.current[user.UserId]?.OnlineStatus ??
          user.OnlineStatus,
      } as User;
      await createCache(String(accountId ?? user.UserId)).profiles.put(
        durableProfile,
      );
      durableProfileRef.current[user.UserId] = durableProfile;
      storageRef.current[user.UserId] = mergeUserPresence(durableProfile);
      checkedAtRef.current[user.UserId] = Date.now();
      setCacheVersion((version) => version + 1);
    },
    [accountId, mergeUserPresence],
  );

  useEffect(() => {
    if (!accountId) return;
    void (async () => {
      const userIds = [
        accountId,
        ...contacts.map((contact) => contact.UserId),
      ].filter((userId, index, all) => all.indexOf(userId) === index);
      for (const userId of userIds) {
        try {
          await get(userId);
          const state = initialStatesRef.current.get(userId);
          if (state && applyUserState(userId, state)) {
            initialStatesRef.current.delete(userId);
          }
        } catch {
          // The normal user loading path reports profile failures to its caller.
        }
      }
    })();
  }, [accountId, applyUserState, contacts, get]);

  return (
    <UserContext.Provider value={{ get, update }}>
      {props.children}
    </UserContext.Provider>
  );
}

/**
 * Executes useUser.
 * @param none This function has no parameters.
 * @returns contextValue.
 */
export function useUser(): contextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
