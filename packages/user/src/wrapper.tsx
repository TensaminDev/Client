import { useEffect, useState } from "react";
import { useUser, type User } from "./context";

import { failedUser } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";

// Wrapper function to pass user data to some component
export default function Wrapper(props: {
  userId?: number | "own";
  loading: React.ReactNode;
  component: (user: User) => React.ReactNode;
}) {
  const { get } = useUser();
  const { load } = useStorage();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (props.userId == null) {
      setUser(failedUser);
      return;
    }

    let active = true;

    if (props.userId === "own") {
      load("user_id")
        .then((id) => {
          get(id)
            .then((user) => (active ? setUser(user) : null))
            .catch(() => setUser(failedUser));
        })
        .catch(() => setUser(failedUser));
      return;
    }

    get(props.userId)
      .then((value) => {
        if (active) {
          setUser(value);
        }
      })
      .catch(() => {
        if (active) {
          setUser(failedUser);
        }
      });

    return () => {
      active = false;
    };
  }, [load, get, props.userId]);

  return <>{user ? props.component(user) : props.loading}</>;
}
