import type { User } from "@tensamin/user/context";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
} from "@methanium/ui";
import { Skeleton } from "@methanium/ui";
import { getStatusColor } from "@tensamin/shared/data";

export function Basic({
  user,
  extra,
}: {
  user: User;
  extra?: React.ReactNode;
}) {
  const display = user.Display || user.Username || "Unknown";
  const onlineStatus = user.OnlineStatus || "user_borked";
  const avatar = user.Avatar
    ? `data:image/webp;base64,${user.Avatar}`
    : undefined;

  return (
    <Button
      render={<div />}
      variant="outline"
      className="animate-in fade-in duration-300 h-auto w-full justify-start gap-2.5 rounded-xl min-h-12.5!"
    >
      <div className="relative shrink-0 overflow-visible">
        <Avatar>
          <AvatarImage src={avatar} />
          <AvatarFallback>{display.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="absolute -bottom-0.5 -right-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
                <div
                  style={{
                    backgroundColor: getStatusColor(onlineStatus),
                  }}
                  className="h-2.25 w-2.25 rounded-full"
                />
              </div>
            }
          />
          <TooltipContent>
            {onlineStatus
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex w-full flex-col items-start justify-center gap-1 text-[15px]">
        <p>{display}</p>
      </div>
      <div className="pr-1">{extra}</div>
    </Button>
  );
}

export function Loading() {
  return <Skeleton className="h-12.5! rounded-2xl" />;
}
