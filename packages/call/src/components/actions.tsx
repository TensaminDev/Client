import {
  Card,
  CardContent,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import ScreenshareButton from "./buttons/screenshare";
import LeaveButton from "./buttons/leave";
import {
  setCallIsPopout,
  stopWatchingFocusedStream,
  triggerCallLayoutCalculation,
  useCall,
} from "../store";
import InviteButton from "./buttons/invite";
import {
  Maximize,
  Minimize,
  SquareArrowOutDownLeft,
  SquareArrowOutUpRight,
} from "lucide-react";

export default function Actions() {
  const sharedClasses = "w-14 h-10";
  const sharedIconSize = 15;
  const view = useCall((state) => state.view);
  const focusedParticipantId = useCall((state) => state.focusedParticipantId);
  const watchedStreamParticipantIds = useCall(
    (state) => state.watchedStreamParticipantIds,
  );
  const isWatchingFocusedStream =
    view === "focused" &&
    focusedParticipantId != null &&
    watchedStreamParticipantIds.includes(focusedParticipantId);

  const callIsPopout = useCall((state) => state.callIsPopout);
  const callIsFullscreen = useCall((state) => state.callIsFullscreen);
  const screenRef = useCall((state) => state.screenRef);

  const toggleFullscreen = async () => {
    if (callIsFullscreen) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await screenRef?.current?.requestFullscreen().catch(() => undefined);
    }

    triggerCallLayoutCalculation();
  };

  return (
    <div className="w-full flex justify-between items-center">
      <div className="w-30" />
      <Card className="p-1.75">
        <CardContent className="p-0! flex gap-1.75">
          <MuteButton className={sharedClasses} iconSize={sharedIconSize} />
          <DeafButton className={sharedClasses} iconSize={sharedIconSize} />
          <ScreenshareButton
            className={sharedClasses}
            iconSize={sharedIconSize}
          />
          <InviteButton className={sharedClasses} iconSize={sharedIconSize} />
          {isWatchingFocusedStream ? (
            <Button
              className="h-10"
              variant="destructive"
              onClick={() => stopWatchingFocusedStream()}
            >
              Stop watching
            </Button>
          ) : (
            <LeaveButton className={sharedClasses} iconSize={sharedIconSize} />
          )}
        </CardContent>
      </Card>
      <div className="w-30 flex justify-end">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={() => setCallIsPopout(!callIsPopout)}
                variant="link"
                className="w-11 h-11 p-0! text-foreground"
              >
                {callIsPopout ? (
                  <SquareArrowOutDownLeft className="size-6" />
                ) : (
                  <SquareArrowOutUpRight className="size-6" />
                )}
              </Button>
            }
          />
          <TooltipContent>Popout</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={() => {
                  void toggleFullscreen();
                }}
                variant="link"
                className="w-11 h-11 p-0! mr-3 text-foreground"
              >
                {callIsFullscreen ? (
                  <Minimize className="size-6" />
                ) : (
                  <Maximize className="size-6" />
                )}
              </Button>
            }
          />
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
