import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import { MonitorDot, ScreenShare } from "lucide-react";
import { useCall } from "../../context";

export default function ScreenshareButton({
  className,
}: {
  className?: string;
}) {
  const { room } = useCall();

  const isScreensharing = room.localParticipant.isScreenShareEnabled;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={isScreensharing ? "secondary" : "default"}
            className={className}
          >
            {isScreensharing ? <MonitorDot /> : <ScreenShare />}
          </Button>
        }
      />
      <PopoverContent className="w-auto flex flex-col gap-2">
        <Button
          disabled={isScreensharing}
          onClick={() => room.localParticipant.setScreenShareEnabled(true)}
        >
          Start
        </Button>
        <Button
          variant="destructive"
          disabled={!isScreensharing}
          onClick={() => room.localParticipant.setScreenShareEnabled(false)}
        >
          Stop
        </Button>
        <Button>idk</Button>
      </PopoverContent>
    </Popover>
  );
}
