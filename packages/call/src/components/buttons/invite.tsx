import { useEffect, useState } from "react";
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "@nonanium/ui";
import Wrapper from "@tensamin/identity/wrapper";
import { Mail } from "lucide-react";
import { sendCallInvite, useCall } from "../../store";
import { log, toast } from "@tensamin/shared/log";
import { useSession } from "@tensamin/identity/session";
import { useStorage } from "@tensamin/storage/context";

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
  const { load } = useStorage();
  const isMobile = useIsMobile();
  const screenRef = useCall((state) => state.screenRef);
  const invitedUserId = useCall((state) => state.invitedUserId);
  const currentCallData = useCall((state) => state.currentCallData);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [open, setOpen] = useState(false);
  const [ownId, setOwnId] = useState<number>();

  useEffect(() => {
    void load("user_id").then(setOwnId);
  }, [load]);

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

  const trigger = (
    <Button variant="secondary" className={className}>
      <Mail style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
    </Button>
  );
  const contactsContent = contacts
    .filter((contact) => ownId !== undefined && contact.UserId !== ownId)
    .map((contact) => {
      // Server-verified membership of the current call.
      const inCurrentCall =
        currentCallData?.status === "ready" &&
        currentCallData.userIds.includes(contact.UserId);
      return (
      <Wrapper
        key={contact.UserId}
        userId={contact.UserId}
        fields={["Display", "OnlineStatus"]}
        loading={<div>Loading...</div>}
        component={(user) => (
          <Button
            className="w-full justify-start"
            variant="ghost"
            disabled={invitedUserId !== null || inCurrentCall || user.OnlineStatus === "iota_offline" || user.OnlineStatus === "iota_borked"}
            onClick={() => {
              void sendCallInvite(contact.UserId)
                .then(() => setOpen(false))
                .catch((error) => {
                  toast(
                    "error",
                    error instanceof Error
                      ? `Call invitation unavailable: ${error.message}`
                      : "Call invitation unavailable.",
                  );
                  log(1, "call", "red", "Failed to send call invite", error);
                });
            }}
          >
            {user.Display}
          </Button>
        )}
      />
      );
    });

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="pb-0">
            <DrawerTitle>Invite a user to the call</DrawerTitle>
          </DrawerHeader>
          <div className="flex max-h-[70dvh] flex-col gap-1 overflow-y-auto p-4">
            {contactsContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            tooltip ? (
              <TooltipTrigger
                render={({ ref, onClick }) => (
                  <Button variant="secondary" ref={ref} onClick={onClick} className={className}>
                    <Mail
                      style={{
                        scale: (iconSize ? iconSize + 100 : 100) + "%",
                      }}
                    />
                  </Button>
                )}
              />
            ) : (
              trigger
            )
          }
        />
        <PopoverContent
          className="flex w-40 flex-col gap-0.5 p-1!"
          portalProps={{ container: portalContainer }}
        >
          {contactsContent}
        </PopoverContent>
      </Popover>
      {tooltip ? (
        <TooltipContent portalProps={{ container: portalContainer }}>
          {tooltip}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
