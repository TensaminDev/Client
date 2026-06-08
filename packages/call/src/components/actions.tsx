import {
  Card,
  CardContent,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tensamin/ui";
import { useEffect, useState } from "react";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import ScreenshareButton from "./buttons/screenshare";
import LeaveButton from "./buttons/leave";
import {
  setCallIsPopout,
  setUsersInFocusedViewHidden,
  stopWatchingFocusedStream,
  triggerCallLayoutCalculation,
  useCall,
} from "../store";
import InviteButton from "./buttons/invite";
import {
  ChevronDown,
  ChevronUp,
  Maximize,
  Minimize,
  ScreenShareOff,
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

  // Fullscreen stuff
  const callIsPopout = useCall((state) => state.callIsPopout);
  const callIsFullscreen = useCall((state) => state.callIsFullscreen);
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

  const toggleFullscreen = async () => {
    const screen = screenRef?.current;
    const fullscreenDocument = screen?.ownerDocument ?? document;

    if (callIsFullscreen) {
      await fullscreenDocument.exitFullscreen().catch(() => undefined);
    } else {
      await screen?.requestFullscreen().catch(() => undefined);
    }

    triggerCallLayoutCalculation();
  };

  // Hide users in focused view
  const usersInFocusedViewHidden = useCall(
    (state) => state.usersInFocusedViewHidden,
  );

  return (
    <div className="w-full flex justify-between items-center">
      <div className="w-30 flex justify-start">
        {view === "focused" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  onClick={() =>
                    setUsersInFocusedViewHidden(!usersInFocusedViewHidden)
                  }
                  variant="link"
                  className="w-11 h-11 p-0! ml-3 text-foreground"
                >
                  {usersInFocusedViewHidden ? (
                    <ChevronUp className="size-6" />
                  ) : (
                    <ChevronDown className="size-6" />
                  )}
                </Button>
              }
            />
            <TooltipContent portalProps={{ container: portalContainer }}>
              Hide users
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <Card className="p-1.75">
        <CardContent className="p-0! flex gap-1.75">
          <MuteButton
            className={sharedClasses}
            iconSize={sharedIconSize}
            tooltip="Mute"
            portalContainer={portalContainer}
          />
          <DeafButton
            className={sharedClasses}
            iconSize={sharedIconSize}
            tooltip="Deafen"
            portalContainer={portalContainer}
          />
          <ScreenshareButton
            className={sharedClasses}
            iconSize={sharedIconSize}
            tooltip="Screenshare"
          />
          <InviteButton
            className={sharedClasses}
            iconSize={sharedIconSize}
            tooltip="Invite"
          />
          {isWatchingFocusedStream ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    className={sharedClasses}
                    variant="destructive"
                    onClick={() => stopWatchingFocusedStream()}
                  >
                    <ScreenShareOff
                      style={{
                        scale:
                          (sharedIconSize ? sharedIconSize + 100 : 100) + "%",
                      }}
                    />
                  </Button>
                }
              />
              <TooltipContent portalProps={{ container: portalContainer }}>
                Stop watching
              </TooltipContent>
            </Tooltip>
          ) : (
            <LeaveButton
              className={sharedClasses}
              iconSize={sharedIconSize}
              tooltip="Leave"
              portalContainer={portalContainer}
            />
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
          <TooltipContent portalProps={{ container: portalContainer }}>
            Popout
          </TooltipContent>
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
          <TooltipContent portalProps={{ container: portalContainer }}>
            Fullscreen
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
