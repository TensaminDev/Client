import { useUser, type User } from "@tensamin/user/context";
import { useCall } from "../store";
import { useEffect, useState } from "react";

export default function TopBar() {
  const { get } = useUser();
  const room = useCall((state) => state.room);

  const userIds = Array.from(room.remoteParticipants.values(), (participant) =>
    Number(participant.identity),
  );
  const userIdsKey = userIds.join(",");

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let active = true;

    if (userIds.length === 0) {
      setUsers([]);
      return () => {
        active = false;
      };
    }

    void Promise.all(userIds.map((id) => get(id)))
      .then((users) => {
        if (!active) {
          return;
        }

        setUsers(users);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setUsers([]);
      });

    return () => {
      active = false;
    };
  }, [get, userIdsKey]);

  return (
    <div className="w-full flex justify-between h-12">
      <div className="flex gap-1">
        {users.map((user) => (
          <div key={user.user_id}>{user.display}</div>
        ))}
      </div>
    </div>
  );
}
