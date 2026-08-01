import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMTP } from "@tensamin/mtp";

import { mtp as schemas } from "@tensamin/shared/data";
import type z from "zod";
import { createCache } from "@tensamin/cache";
import { useStorage } from "@tensamin/storage/context";
import { useSession } from "@tensamin/storage/session";

export type User = z.infer<typeof schemas.GetUserData.response>;

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

  const { send } = useMTP();
  const { load } = useStorage();
  const { contacts } = useSession();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    void load("user_id").then((accountId) => {
      setAccountId(accountId);
    });
  }, [load]);

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
          storageRef.current[userId] = cached;
          const checkedAt = checkedAtRef.current[userId];
          if (!checkedAt || Date.now() - checkedAt < USER_CACHE_MAX_AGE) {
            checkedAtRef.current[userId] = Date.now();
            return cached;
          }
        }
        try {
          const userData = await send("GetUserData", { UserId: userId });
          if (userData.type === "ErrorNotFound" || userData.data.UserId === 0) {
            delete storageRef.current[userId];
            delete checkedAtRef.current[userId];
            await cache.profiles.delete(userId);
            throw new Error("GetUserData failed: user not found");
          }
          if (userData.type.startsWith("Error")) {
            throw new Error(`GetUserData failed: ${userData.type}`);
          }
          const user = userData.data;
          storageRef.current[userId] = user;
          checkedAtRef.current[userId] = Date.now();
          return user;
        } catch (error) {
          if (cached && storageRef.current[userId]) {
            checkedAtRef.current[userId] = Date.now();
            return cached;
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
    [accountId, cacheVersion, send],
  );

  const update = useCallback(
    async (user: User) => {
      await createCache(String(accountId ?? user.UserId)).profiles.put(user);
      storageRef.current[user.UserId] = user;
      checkedAtRef.current[user.UserId] = Date.now();
      setCacheVersion((version) => version + 1);
    },
    [accountId],
  );

  useEffect(() => {
    if (!accountId) return;
    for (const contact of contacts) void get(contact.UserId);
  }, [accountId, contacts, get]);

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
