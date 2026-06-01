import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
} from "@tensamin/ui";
import Wrapper from "@tensamin/user/wrapper";
import { PhoneIncoming, PhoneMissed } from "lucide-react";

export default function InvitePopup({
  open,
  setOpen,
  onAccept,
  user,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  onAccept: (value: boolean) => void;
  user: number;
}) {
  return (
    <Wrapper
      userId={user}
      loading={null}
      component={(user) => (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex flex-col gap-5 items-center justify-center w-65 h-80">
            <Avatar className="size-30">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-5xl">
                {user.display.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="text-xl font-medium">{user.display}</p>
            <div className="w-full flex justify-center gap-3">
              <Button
                className="w-14 h-14"
                variant="subtleDefault"
                onClick={() => onAccept(true)}
              >
                <PhoneIncoming className="size-5" />
              </Button>
              <Button
                className="w-14 h-14"
                variant="destructive"
                onClick={() => onAccept(false)}
              >
                <PhoneMissed className="size-5" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    />
  );
}
