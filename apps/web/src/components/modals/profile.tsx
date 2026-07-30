import type { User } from "@tensamin/user/context";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@methanium/ui";
import Text from "@tensamin/markdown/text";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export default function Profile({ user }: { user: User }) {
  const [showAdvancedInformation, setShowAdvancedInformation] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2  items-center">
        <Avatar className="size-10">
          <AvatarImage src={user.Avatar} />
          <AvatarFallback className="text-lg">
            {user.Display.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <p className="text-lg font-semibold">{user.Display}</p>
          <p className="text-muted-foreground">{user.Username}</p>
        </div>
      </div>
      <Text value={user.About || ""} />
      <Button
        className="h-auto justify-start gap-1.5 px-0 py-1 text-base font-medium text-white no-underline hover:no-underline"
        variant="ghost"
        aria-expanded={showAdvancedInformation}
        onClick={() => setShowAdvancedInformation((show) => !show)}
      >
        {showAdvancedInformation ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
        <span>Show advanced information</span>
      </Button>
      {showAdvancedInformation && (
        <div className="flex flex-col">
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            Iota ID: <code>{user.IotaId}</code>
          </p>
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            User ID: <code>{user.UserId}</code>
          </p>
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            Public Key: <code>{user.PublicKey}</code>
          </p>
        </div>
      )}
    </div>
  );
}
