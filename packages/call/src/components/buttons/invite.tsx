import { useEffect, useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import Wrapper from "@tensamin/user/wrapper";
import { Mail } from "lucide-react";
import { sendCallInvite, useCall } from "../../store";
import { log, toast } from "@tensamin/shared/log";
import { useSession } from "@tensamin/storage/session";

export default function InviteButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const { contacts } = useSession();
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button className={className}>
            <Mail style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
          </Button>
        }
      />
      <PopoverContent
        className="flex w-40 flex-col gap-0.5 p-1!"
        portalProps={{ container: portalContainer }}
      >
        {contacts.map((contact) => (
          <Wrapper
            key={contact.user_id}
            userId={contact.user_id}
            loading={<div>Loading...</div>}
            component={(user) => (
              <Button
                className="w-full justify-start"
                variant="ghost"
                onClick={() => {
                  void sendCallInvite(contact.user_id).catch((err) => {
                    toast(
                      "error",
                      "Failed to send call invite. Check console for details.",
                    );
                    log(1, "call", "red", "Failed to send call invite", err);
                  });
                }}
              >
                {user.display}
              </Button>
            )}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
