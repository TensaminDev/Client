import { Expand, Lock, LockOpen } from "lucide-react";
import { useCall } from "../context";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from "@tensamin/ui";
import { LeaveIcon } from "@livekit/components-react";
import ScreenshareButton from "./buttons/screenshare";

export default function SidebarBox() {
  const { state, room, disconnect, openCallPage, callId } = useCall();
  const isMobile = useIsMobile();

  return state === "closed" ? null : (
    <Card className="p-1.5 gap-1" hidden={isMobile}>
      <CardHeader className="p-0!">
        <ConnectionBar
          state={state}
          encrypted={
            room.localParticipant.isE2EEEnabled &&
            room.localParticipant.isEncrypted
          }
        />
      </CardHeader>
      <CardContent className="p-0! flex justify-end gap-1">
        <Button className="w-9 h-9" onClick={() => openCallPage(callId || "")}>
          <Expand />
        </Button>
        <ScreenshareButton className="w-9 h-9" />
        <Button
          size="lg"
          className="w-9 h-9"
          onClick={() => disconnect()}
          variant="destructive"
        >
          <LeaveIcon />
        </Button>
      </CardContent>
    </Card>
  );
}

function ConnectionBar({
  state,
  encrypted,
}: {
  state: "closed" | "closing" | "connecting" | "open" | "encrypting";
  encrypted: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="lg"
            variant={
              state === "open" && encrypted ? "subtleDefault" : "destructive"
            }
            className="flex justify-between items-center"
          >
            {state === "encrypting" && "Encrypting..."}
            {state === "connecting" && "Connecting..."}
            {state === "open" && "Connected"}
            {state === "closed" && "Closed"}
            {state === "closing" && "Closing"}

            <Tooltip>
              <TooltipTrigger
                render={
                  encrypted ? (
                    <Lock color="var(--primary-foreground-alt)" />
                  ) : (
                    <LockOpen color="var(--destructive)" />
                  )
                }
              />
              <TooltipContent>
                {encrypted ? "Encrypted" : "Unencrypted"}
              </TooltipContent>
            </Tooltip>
          </Button>
        }
      />
      <PopoverContent side="top">Test stuff</PopoverContent>
    </Popover>
  );
}
