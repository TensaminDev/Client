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
    <Card className="animate-in fade-in duration-300 rounded-2xl py-0 m-px">
      <CardHeader className="flex flex-row gap-2.5 items-center justify-start p-2">
        <div className="relative shrink-0 overflow-visible">
          <Avatar>
            <AvatarImage src={user.avatar} />
            <AvatarFallback>
              {user.display.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="absolute -bottom-0.75 -right-0.75 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-card">
                  <div
                    style={{
                      backgroundColor: getStatusColor(user.online_status),
                    }}
                    className="h-2.5 w-2.5 rounded-full"
                  />
                </div>
              }
            />
            <TooltipContent>
              {user.online_status
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-col gap-1 w-full items-start justify-center text-[15px]">
          <p>{user.display}</p>
        </div>
        <div className="pr-2">{extra}</div>
      </CardHeader>
    </Card>
  );
}

export function Loading() {
  return <Skeleton className="h-12.5 rounded-2xl" />;
}
