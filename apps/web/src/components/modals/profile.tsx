import type { User } from "@tensamin/user/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import { toLossySixDigitCode } from "@tensamin/shared/code";
import Text from "@tensamin/markdown/text";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useCrypto } from "@tensamin/crypto/context";
import { useStorage } from "@tensamin/storage/context";
import { useUser } from "@tensamin/user/context";

export default function Profile({ user }: { user: User }) {
  const [showAdvancedInformation, setShowAdvancedInformation] = useState(false);
  const [sharedSecret, setSharedSecret] = useState("");

  const { getSharedSecret } = useCrypto();
  const { load } = useStorage();
  const { get } = useUser();

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const ownId = await load("user_id");
        const privateKey = await load("private_key");
        const ownData = await get(ownId);
        const secret = await getSharedSecret(
          privateKey,
          ownData.public_key,
          user.public_key,
        );

        if (active) {
          setSharedSecret(secret);
        }
      } catch {
        if (active) {
          setSharedSecret("");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [get, getSharedSecret, load, user.public_key]);

  const sharedSecretCode = sharedSecret
    ? toLossySixDigitCode(sharedSecret)
    : "------";

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
      <Button
        className="h-auto justify-start gap-1.5 px-0 py-1 text-base font-medium text-white no-underline hover:no-underline"
        variant="link"
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
          <p className="text-white flex gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
            Shared Code: <code>{sharedSecretCode}</code>{" "}
            <Tooltip>
              <TooltipTrigger render={<Info className="size-3.5" />} />
              <TooltipContent>
                You can compare this code with the conversation partner to
                validate that this chat is E2EE
              </TooltipContent>
            </Tooltip>
          </p>
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            Iota ID: <code>{user.iota_id}</code>
          </p>
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            User ID: <code>{user.user_id}</code>
          </p>
          <p className="text-muted-foreground text-xs overflow-hidden text-ellipsis whitespace-nowrap">
            Public Key: <code>{user.public_key}</code>
          </p>
        </div>
      )}
    </div>
  );
}
