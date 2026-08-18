import { useUserFields } from "@tensamin/user/context";
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
} from "@methanium/ui";

const USER_FIELDS = ["Avatar", "Display"] as const;

function ParticipantAvatar({
  userId,
  portalContainer,
}: {
  userId: number;
  portalContainer?: HTMLElement;
}) {
  const { data: user } = useUserFields(userId, USER_FIELDS);
  if (!user) return null;

  return (
    <div className="-ml-4">
      <Tooltip>
        <TooltipTrigger
          render={
            <Avatar className="size-7">
              <AvatarImage src={user.Avatar} />
              <AvatarFallback className="text-xs">
                {user.Display.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          }
        />
        <TooltipContent
          side="bottom"
          portalProps={{ container: portalContainer }}
        >
          {user.Display}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function TopBar() {
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
  const [ownId, setOwnId] = useState<number>();

  useEffect(() => {
    void load("user_id").then(setOwnId);
  }, [load]);

  const participantIds = ownId === undefined ? userIds : [ownId, ...userIds];

  return (
    <div className="w-full flex justify-between h-12">
      <div className="flex gap-1 m-3 ml-7">
        {participantIds.map((userId) => (
          <ParticipantAvatar
            key={userId}
            userId={userId}
            portalContainer={portalContainer}
          />
        ))}
      </div>
    </div>
  );
}
