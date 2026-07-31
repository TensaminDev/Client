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
import { MonitorDot, ScreenShare } from "lucide-react";
import { toast } from "@tensamin/shared/log";
import {
  startScreenShare,
  stopCameraShare,
  stopScreenShare,
  useCall,
} from "../../store";
import { getMediaShareAdapter, type MediaShareKind } from "../../mediaShare";
import MediaShareDialog from "../mediaShareDialog";

export default function MediaShareButton({
  className,
  iconSize,
  tooltip,
  defaultPortal,
}: {
  className?: string;
  iconSize?: number;
  tooltip?: string;
  defaultPortal?: boolean;
}) {
  const isScreensharing = useCall((state) => state.screenShareEnabled);
  const cameraEnabled = useCall((state) => state.cameraEnabled);
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [dialogKind, setDialogKind] = useState<MediaShareKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!defaultPortal) setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef, defaultPortal]);

  async function beginScreenShare() {
    try {
      const capabilities = await getMediaShareAdapter().getCapabilities();
      if (capabilities.screenPicker === "sources") {
        setDialogKind("screen");
      } else {
        await startScreenShare({ includeAudio: true });
      }
    } catch (error) {
      console.error("Failed to start screen sharing", error);
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to start screen sharing.",
      );
    }
  }

  async function stop(kind: MediaShareKind) {
    try {
      await (kind === "screen" ? stopScreenShare() : stopCameraShare());
    } catch (error) {
      console.error(`Failed to stop ${kind} sharing`, error);
      toast("error", `Failed to stop ${kind} sharing.`);
    }
  }

  const trigger = (
    <Button
      variant={isScreensharing || cameraEnabled ? "subtleDefault" : "default"}
      className="w-full! h-full!"
    >
      {isScreensharing || cameraEnabled ? (
        <MonitorDot
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
      ) : (
        <ScreenShare
          style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }}
        />
      )}
    </Button>
  );

  return (
    <>
      <Tooltip>
        <Popover onOpenChange={setMenuOpen} open={menuOpen}>
          <PopoverTrigger
            render={({ onClick }) =>
              tooltip ? (
                <TooltipTrigger
                  render={({ ref }) => (
                    <span
                      ref={ref as React.Ref<HTMLSpanElement>}
                      onClick={onClick}
                      className={className}
                    >
                      {trigger}
                    </span>
                  )}
                />
              ) : (
                <span className={className} onClick={onClick}>
                  {trigger}
                </span>
              )
            }
          />
          <PopoverContent
            className="flex w-48 flex-col gap-2"
            portalProps={{
              container: defaultPortal ? undefined : portalContainer,
            }}
          >
            <Button
              disabled={isScreensharing}
              onClick={() => {
                setMenuOpen(false);
                void beginScreenShare();
              }}
            >
              Share screen
            </Button>
            <Button
              disabled={cameraEnabled}
              onClick={() => {
                setMenuOpen(false);
                setDialogKind("camera");
              }}
            >
              Share camera
            </Button>
            {isScreensharing ? (
              <Button variant="destructive" onClick={() => void stop("screen")}>
                Stop screen sharing
              </Button>
            ) : null}
            {cameraEnabled ? (
              <Button variant="destructive" onClick={() => void stop("camera")}>
                Stop camera
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
        {tooltip ? (
          <TooltipContent
            portalProps={{
              container: defaultPortal ? undefined : portalContainer,
            }}
          >
            {tooltip}
          </TooltipContent>
        ) : null}
      </Tooltip>

      {dialogKind ? (
        <MediaShareDialog
          kind={dialogKind}
          open
          onOpenChange={(open) => !open && setDialogKind(null)}
          portalContainer={portalContainer}
        />
      ) : null}
    </>
  );
}
