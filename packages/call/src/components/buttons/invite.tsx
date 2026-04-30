import { useTTP } from "@tensamin/ttp";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import Wrapper from "@tensamin/user/wrapper";
import { Mail } from "lucide-react";
import { sendCallInvite } from "../../store";
import { log, toast } from "@tensamin/shared/log";

export default function InviteButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const { contacts } = useTTP();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button className={className}>
            <Mail style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
          </Button>
        }
      />
      <PopoverContent className="flex w-40 flex-col gap-0.5 p-1!">
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
