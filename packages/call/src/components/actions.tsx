import {
  Card,
  CardContent,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
  cn,
} from "@methanium/ui";
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
import { useStorage } from "@tensamin/storage/context";

export default function Actions() {
  const sharedClasses = "w-14! h-10!";
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

  const { load } = useStorage();
  const [ownId, setOwnId] = useState(0);
  useEffect(() => {
    load("user_id").then(setOwnId);
  }, [load]);

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

  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "w-full flex items-center",
        isMobile ? "justify-center" : "justify-between",
      )}
    >
      {!isMobile && (
        <div className="w-30 flex justify-start">
          {view === "focused" && (
            <Tooltip>
              <TooltipTrigger
                render={({ ref, onClick }) => (
                  <Button
                    ref={ref as React.Ref<HTMLButtonElement>}
                    onClick={(event) => {
                      onClick?.(event);
                      setUsersInFocusedViewHidden(!usersInFocusedViewHidden);
                    }}
                    variant="ghost"
                    className="w-11 h-11! p-0! ml-3 text-foreground border-0!"
                  >
                    {usersInFocusedViewHidden ? (
                      <ChevronUp className="size-6" />
                    ) : (
                      <ChevronDown className="size-6" />
                    )}
                  </Button>
                )}
              />
              <TooltipContent portalProps={{ container: portalContainer }}>
                Hide users
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
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
          {isWatchingFocusedStream && focusedParticipantId !== ownId ? (
            <Tooltip>
              <TooltipTrigger
                render={({ ref, onClick }) => (
                  <Button
                    ref={ref}
                    className={sharedClasses}
                    variant="destructive"
                    onClick={(event) => {
                      onClick?.(event);
                      stopWatchingFocusedStream();
                    }}
                  >
                    <ScreenShareOff
                      style={{
                        scale:
                          (sharedIconSize ? sharedIconSize + 100 : 100) + "%",
                      }}
                    />
                  </Button>
                )}
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
      {!isMobile && (
        <div className="w-30 flex justify-end gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={({ ref, onClick }) => (
                <Button
                  ref={ref}
                  onClick={(event) => {
                    onClick?.(event);
                    setCallIsPopout(!callIsPopout);
                  }}
                  variant="ghost"
                  className="w-11 h-11! p-0! text-foreground border-0!"
                >
                  {callIsPopout ? (
                    <SquareArrowOutDownLeft className="size-6" />
                  ) : (
                    <SquareArrowOutUpRight className="size-6" />
                  )}
                </Button>
              )}
            />
            <TooltipContent portalProps={{ container: portalContainer }}>
              Popout
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={({ ref, onClick }) => (
                <Button
                  ref={ref}
                  onClick={(event) => {
                    onClick?.(event);
                    void toggleFullscreen();
                  }}
                  variant="ghost"
                  className="w-11 h-11! p-0! mr-3 text-foreground border-0!"
                >
                  {callIsFullscreen ? (
                    <Minimize className="size-6" />
                  ) : (
                    <Maximize className="size-6" />
                  )}
                </Button>
              )}
            />
            <TooltipContent portalProps={{ container: portalContainer }}>
              Fullscreen
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
