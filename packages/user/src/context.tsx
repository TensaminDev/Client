import * as React from "react";
import { useTTP } from "@tensamin/ttp/context";

import { ttp as schemas } from "@tensamin/shared/data";
import type z from "zod";

export type User = z.infer<typeof schemas.get_user_data.response>;

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

  const { send } = useTTP();

  /**
   * Executes get.
   * @param userId Parameter userId.
   * @returns Promise<User>.
   */
  async function get(userId: number): Promise<User> {
    if (storageRef.current[userId] === undefined) {
      const userData = await send("get_user_data", { user_id: userId });

      // Temp, add base64 stuff
      userData.data.avatar = userData.data.avatar
        ? `data:image/png;base64,${userData.data.avatar}`
        : undefined;
      // Temp end

      storageRef.current[userId] = userData.data;
    }

    return storageRef.current[userId];
  }

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
