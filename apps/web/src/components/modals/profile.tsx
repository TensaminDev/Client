import type { User } from "@tensamin/user/context";
import { Avatar, AvatarFallback, AvatarImage } from "@tensamin/ui";
import Text from "@tensamin/markdown/text";

export default function Profile({ user }: { user: User }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2  items-center">
        <Avatar className="size-10">
          <AvatarImage src={user.avatar} />
          <AvatarFallback className="text-lg">
            {user.display.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <p className="text-lg font-semibold">{user.display}</p>
          <p className="text-muted-foreground">{user.username}</p>
        </div>
      </div>
      <Text value={user.about || ""} />
      <div className="flex flex-col">
        <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
          iota: {user.iota_id}
        </p>
        <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
          user: {user.user_id}
        </p>
        <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
          pub key: {user.public_key}
        </p>
      </div>
    </div>
  );
}
