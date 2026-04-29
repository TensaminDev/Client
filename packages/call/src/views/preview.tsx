import { useEffect, useState } from "react";
import { useCall } from "../store";
import { useUser, type User } from "@tensamin/user/context";

export default function Preview() {
  const { get } = useUser();
  const currentCallData = useCall((state) => state.currentCallData);

  const [data, setData] = useState<User[]>([]);

  useEffect(() => {
    let active = true;

    if (!currentCallData?.exists) {
      setData([]);
      return () => {
        active = false;
      };
    }

    void Promise.all(currentCallData.user_ids.map((id) => get(id)))
      .then((users) => {
        if (!active) {
          return;
        }

        setData(users);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setData([]);
      });

    return () => {
      active = false;
    };
  }, [currentCallData, get]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      {currentCallData?.exists ? (
        <div className="flex flex-col gap-2">
          {data.map((user) => {
            return (
              <p key={user.user_id} className="text-2xl">
                User: {user.display}
              </p>
            );
          })}
        </div>
      ) : (
        <p className="text-2xl">Invalid call</p>
      )}
    </div>
  );
}
