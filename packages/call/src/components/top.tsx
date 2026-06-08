import { useUser, type User } from "@tensamin/user/context";
import { useCall, getRoom } from "../store";
import { useEffect, useState } from "react";
import { useStorage } from "@tensamin/storage/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";

export default function TopBar() {
  const { get } = useUser();
  const { load } = useStorage();
  const room = getRoom();
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

  const userIds = Array.from(
    room.remoteParticipants.values(),
    (participant) => {
      const participantId = Number(participant.identity);
      return Number.isInteger(participantId) && participantId > 0
        ? participantId
        : null;
    },
  ).filter((participantId): participantId is number => participantId != null);
  const userIdsKey = userIds.join(",");

  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let active = true;
    const ids = userIdsKey === "" ? [] : userIdsKey.split(",").map(Number);

    void Promise.all(ids.map((id) => get(id)))
      .then(async (users) => {
        if (!active) {
          return;
        }

        const ownId = await load("user_id");
        const ownUser = await get(ownId);

        setUsers([ownUser, ...users]);
      })
      .catch(async () => {
        if (!active) {
          return;
        }

        const ownId = await load("user_id");
        const ownUser = await get(ownId);

        setUsers([ownUser]);
      });

    return () => {
      active = false;
    };
  }, [get, userIdsKey, load]);

  return (
    <div className="w-full flex justify-between h-12">
      <div className="flex gap-1 m-3 ml-7">
        {users.map((user) => (
          <div key={user.user_id} className="-ml-4">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Avatar className="size-7">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback className="text-xs">
                      {user.display.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                }
              />
              <TooltipContent
                side="bottom"
                portalProps={{ container: portalContainer }}
              >
                {user.display}
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}
