import { useEffect, useState } from "react";
import { useUser, type User } from "./context";

import { failedUser } from "@tensamin/shared/data";

// Wrapper function to pass user data to some component
export default function Wrapper(props: {
  userId?: number;
  loading: React.ReactNode;
  component: (user: User) => React.ReactNode;
}) {
  const { get } = useUser();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (props.userId == null) {
      setUser(failedUser);
      return;
    }

    let active = true;

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
  }, [get, props.userId]);

  return <>{user ? props.component(user) : props.loading}</>;
}
