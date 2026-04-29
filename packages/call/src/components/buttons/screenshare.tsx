import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import { MonitorDot, ScreenShare } from "lucide-react";
import { setScreenShareEnabled, useCall } from "../../store";

export default function ScreenshareButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const isScreensharing = useCall((state) => state.screenShareEnabled);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={isScreensharing ? "subtleDefault" : "default"}
            className={className}
          >
            {isScreensharing ? (
              <MonitorDot
                style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
              />
            ) : (
              <ScreenShare
                style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
              />
            )}
          </Button>
        }
      />
      <PopoverContent className="w-auto flex flex-col gap-2">
        <Button
          disabled={isScreensharing}
          onClick={() => void setScreenShareEnabled(true)}
        >
          Start
        </Button>
        <Button
          variant="destructive"
          disabled={!isScreensharing}
          onClick={() => void setScreenShareEnabled(false)}
        >
          Stop
        </Button>
        <Button>idk</Button>
      </PopoverContent>
    </Popover>
  );
}
