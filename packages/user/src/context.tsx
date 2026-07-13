import * as React from "react";
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

const UserContext = React.createContext<contextValue | undefined>(undefined);

/**
 * Executes UserProvider.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function UserProvider(props: { children: React.ReactNode }) {
  const storageRef = React.useRef<Record<number, User>>({});
  const pendingRef = React.useRef<Record<number, Promise<User> | undefined>>(
    {},
  );

  const { send } = useMTP();
  const { load } = useStorage();
  const { contacts } = useSession();
  const [accountId, setAccountId] = React.useState<number | null>(null);

  React.useEffect(() => {
    void load("user_id").then((accountId) => {
      setAccountId(accountId);
    });
  }, [load]);

  /**
   * Executes get.
   * @param userId Parameter userId.
   * @returns Promise<User>.
   */
  const get = React.useCallback(
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
        const cached =
          storageRef.current[userId] ?? (await cache?.profiles.get(userId));
        if (cached) storageRef.current[userId] = cached;
        try {
          const userData = await send("GetUserData", { UserId: userId });
          const user = {
            ...userData.data,
            avatar: userData.data.Avatar
              ? `data:image/webp;base64,${atob(userData.data.Avatar)}`
              : undefined,
          };
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

  React.useEffect(() => {
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
  const context = React.useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
