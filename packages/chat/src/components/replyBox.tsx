import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  Skeleton,
} from "@methanium/ui";
import { Text } from "@methanium/ui/markdown";
import type { User } from "@tensamin/user/context";
import Wrapper from "@tensamin/user/wrapper";
import { Forward, X } from "lucide-react";

function ReplyUser({ user }: { user: User }) {
  return (
    <div className="flex gap-1 items-center">
      <Avatar className="h-5 w-5 shrink-0">
        <AvatarImage src={user.Avatar} />
        <AvatarFallback className="text-[0.6rem]">
          {user.Display.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <p className="text-sm font-semibold text-muted-foreground">
        {user.Display}
      </p>
    </div>
  );
}

export default function ReplyBox({
  edited,
  content,
  loading = false,
  onDismiss,
  user,
  userId,
  variant,
}: {
  edited?: boolean;
  content?: string;
  loading?: boolean;
  onDismiss?: () => void;
  user?: User;
  userId?: number;
  variant: "composer" | "message";
}) {
  return (
    <div
      className={cn(
        variant === "composer" ? "flex justify-center" : "pl-5 w-full",
      )}
    >
      <div
        className={cn(
          "flex w-[90%] items-center gap-1 text-xs",
          variant === "composer"
            ? "justify-start rounded-t-lg border-x border-t border-(--border)/65 bg-background p-1"
            : "text-muted-foreground",
        )}
      >
        <Forward className="shrink-0 opacity-60" size={18} />
        {loading ? (
          <>
            <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-full" />
          </>
        ) : (
          <>
            {user ? (
              <ReplyUser user={user} />
            ) : userId ? (
              <Wrapper
                userId={userId}
                loading={<Skeleton className="h-5 w-5 rounded-full" />}
                component={(resolvedUser) => <ReplyUser user={resolvedUser} />}
              />
            ) : null}
            {content !== undefined && (
              <div className="h-5.5 min-w-0 flex-1 truncate flex gap-1">
                <Text
                  fontSize="0.88rem"
                  showEditedIndicator={edited}
                  value={content}
                />
              </div>
            )}
          </>
        )}
        {onDismiss && (
          <Button
            aria-label="Cancel reply"
            className="ml-auto h-5 w-5 rounded-md! p-0!"
            onClick={onDismiss}
            size="xs"
            variant="ghost"
          >
            <X className="opacity-60" size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
