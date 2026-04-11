import { useEffect, useState } from "react";
import { useUser, type User } from "./context";

import { failedUser } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";

// Wrapper function to pass user data to some component
export default function Wrapper(props: {
  userId: number | "own";
  loading: React.ReactNode;
  component: (user: User) => React.ReactNode;
}) {
  const { get } = useUser();
  const { load } = useStorage();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (props.userId == null) return;

    let active = true;

    void (async () => {
      try {
        const userId =
          props.userId === "own" ? await load("user_id") : props.userId;
        const value = await get(userId);

        if (active) {
          setUser(value);
        }
      } catch {
        if (active) {
          setUser(failedUser);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [load, get, props.userId]);

  if (props.userId == null) {
    return <>{props.component(failedUser)}</>;
  }

  return <>{user ? props.component(user) : props.loading}</>;
}
