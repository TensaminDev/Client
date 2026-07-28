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

interface contextValue {
  get(userId: number): Promise<User>;
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

  const { send } = useMTP();
  const { load } = useStorage();
  const { contacts } = useSession();
  const [accountId, setAccountId] = useState<number | null>(null);

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
      if (userId == null) {
        throw new Error("userId is required");
      }

      const pendingUser = pendingRef.current[userId];
      if (pendingUser !== undefined) {
        return pendingUser;
      }

      const request = (async () => {
        const cache = accountId ? createCache(String(accountId)) : null;
        const cachedValue =
          storageRef.current[userId] ?? (await cache?.profiles.get(userId));
        const cachedResult =
          schemas.GetUserData.response.safeParse(cachedValue);
        const cached = cachedResult.success ? cachedResult.data : undefined;
        if (cached) storageRef.current[userId] = cached;
        try {
          const userData = await send("GetUserData", { UserId: userId });
          if (userData.type.startsWith("Error")) {
            throw new Error(`GetUserData failed: ${userData.type}`);
          }
          const user = userData.data;
          storageRef.current[userId] = user;
          return user;
        } catch (error) {
          if (cached) return cached;
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
    [accountId, send],
  );

  useEffect(() => {
    if (!accountId) return;
    for (const contact of contacts) void get(contact.UserId);
  }, [accountId, contacts, get]);

  return (
    <UserContext.Provider value={{ get }}>
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
