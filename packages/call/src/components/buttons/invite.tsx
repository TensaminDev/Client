import { useEffect, useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@methanium/ui";
import Wrapper from "@tensamin/identity/wrapper";
import { Mail } from "lucide-react";
import { sendCallInvite, useCall } from "../../store";
import { log, toast } from "@tensamin/shared/log";
import { useSession } from "@tensamin/storage/session";

export default function InviteButton({
  className,
  iconSize,
  tooltip,
}: {
  className?: string;
  iconSize?: number;
  tooltip?: string;
}) {
  const { contacts } = useSession();
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

  return (
    <Tooltip>
      <Popover>
        <PopoverTrigger
          render={
            tooltip ? (
              <TooltipTrigger
                render={({ ref, onClick }) => (
                  <Button ref={ref} onClick={onClick} className={className}>
                    <Mail
                      style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
                    />
                  </Button>
                )}
              />
            ) : (
              <Button className={className}>
                <Mail
                  style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
                />
              </Button>
            )
          }
        />
        <PopoverContent
          className="flex w-40 flex-col gap-0.5 p-1!"
          portalProps={{ container: portalContainer }}
        >
          {contacts.map((contact) => (
            <Wrapper
              key={contact.UserId}
              userId={contact.UserId}
              fields={["Display"]}
              loading={<div>Loading...</div>}
              component={(user) => (
                <Button
                  className="w-full justify-start"
                  variant="ghost"
                  onClick={() => {
                    void sendCallInvite(contact.UserId).catch((err) => {
                      toast(
                        "error",
                        "Failed to send call invite. Check console for details.",
                      );
                      log(1, "call", "red", "Failed to send call invite", err);
                    });
                  }}
                >
                  {user.Display}
                </Button>
              )}
            />
          ))}
        </PopoverContent>
      </Popover>
      {tooltip && (
        <TooltipContent portalProps={{ container: portalContainer }}>
          {tooltip}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
