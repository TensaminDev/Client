import type { User } from "@tensamin/user/context";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@tensamin/ui";
import { Card, CardHeader } from "@tensamin/ui";
import { Skeleton } from "@tensamin/ui";
import { getStatusColor } from "@tensamin/shared/data";

export function Basic({
  user,
  extra,
}: {
  user: User;
  extra?: React.ReactNode;
}) {
  return (
    <Card className="animate-in fade-in duration-300 rounded-xl py-0 h-12.5!">
      <CardHeader className="flex flex-row gap-2.5 items-center justify-start p-2">
        <div className="relative shrink-0 overflow-visible">
          <Avatar>
            <AvatarImage src={user.Avatar} />
            <AvatarFallback>
              {user.Display.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="absolute -bottom-0.5 -right-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card">
                  <div
                    style={{
                      backgroundColor: getStatusColor(user.OnlineStatus),
                    }}
                    className="h-2.25 w-2.25 rounded-full"
                  />
                </div>
              }
            />
            <TooltipContent>
              {user.OnlineStatus.split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-col gap-1 w-full items-start justify-center text-[15px]">
          <p>{user.Display}</p>
        </div>
        <div className="pr-1">{extra}</div>
      </CardHeader>
    </Card>
  );
}

export function Loading() {
  return <Skeleton className="h-12.5! rounded-2xl" />;
}
