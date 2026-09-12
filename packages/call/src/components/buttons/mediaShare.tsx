import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@methanium/ui";
import { Diamond, MonitorDot, ScreenShare } from "lucide-react";
import { toast } from "@tensamin/shared/log";
import { storageDefaults } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import { startScreenShare, stopScreenShare, useCall } from "../../store";
import { getMediaShareAdapter } from "../../mediaShare";
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
  const screenShareSession = useCall((state) => state.screenShareSession);
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const storage = useStorage();
  const [resolution, setResolution] = useState(
    storageDefaults.call_screen_share_resolution,
  );
  const [frameRate, setFrameRate] = useState(
    storageDefaults.call_screen_share_frame_rate,
  );
  const [shareAudio, setShareAudio] = useState(
    storageDefaults.call_screen_share_audio,
  );
  const [canCaptureAudio, setCanCaptureAudio] = useState(true);

  useEffect(() => {
    if (!defaultPortal) setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef, defaultPortal]);

  useEffect(() => {
    if (!menuOpen) return;
    void Promise.all([
      storage.load("call_screen_share_resolution"),
      storage.load("call_screen_share_frame_rate"),
      storage.load("call_screen_share_audio"),
      getMediaShareAdapter().getCapabilities(),
    ]).then(([nextResolution, nextFrameRate, nextShareAudio, capabilities]) => {
      setResolution(nextResolution);
      setFrameRate(nextFrameRate);
      setShareAudio(nextShareAudio);
      setCanCaptureAudio(capabilities.canShareScreenAudio);
    });
  }, [menuOpen, storage]);

  async function beginScreenShare() {
    try {
      const capabilities = await getMediaShareAdapter().getCapabilities();
      if (capabilities.screenPicker === "sources") {
        setDialogOpen(true);
      } else {
        await startScreenShare({
          includeAudio: shareAudio,
          resolution,
          frameRate,
        });
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

  async function stop() {
    try {
      await stopScreenShare();
    } catch (error) {
      console.error("Failed to stop screen sharing", error);
      toast("error", "Failed to stop screen sharing.");
    }
  }

  const trigger = (
    <Button
      variant={isScreensharing ? "subtleDefault" : "default"}
      className="w-full! h-full!"
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
            className="flex w-35 flex-col gap-6"
            portalProps={{
              container: defaultPortal ? undefined : portalContainer,
            }}
          >
            <div className="flex flex-col gap-2.5">
              <Label>Resolution</Label>
              <RadioGroup
                className="gap-1.5"
                name="screen-share-resolution"
                value={String(resolution)}
                onValueChange={(value) => {
                  const next = Number(value);
                  setResolution(next);
                  void storage.save("call_screen_share_resolution", next);
                }}
              >
                {[720, 1080].map((value) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-md text-sm"
                  >
                    <RadioGroupItem value={String(value)} />
                    {value}p
                  </Label>
                ))}
                <Label className="text-muted-foreground flex cursor-not-allowed items-center gap-2 rounded-md text-sm">
                  <RadioGroupItem value="1440" disabled />
                  1440p <Diamond className="size-3 fill-current" />
                </Label>
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-2.5">
              <Label>Frame rate</Label>
              <RadioGroup
                className="gap-1.5"
                name="screen-share-frame-rate"
                value={String(frameRate)}
                onValueChange={(value) => {
                  const next = Number(value);
                  setFrameRate(next);
                  void storage.save("call_screen_share_frame_rate", next);
                }}
              >
                {[30, 60].map((value) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-md text-sm"
                  >
                    <RadioGroupItem value={String(value)} />
                    {value} FPS
                  </Label>
                ))}
                <Label className="text-muted-foreground flex cursor-not-allowed items-center gap-2 rounded-md text-sm">
                  <RadioGroupItem value="120" disabled />
                  120 FPS <Diamond className="size-3 fill-current" />
                </Label>
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="screen-share-audio"
                  checked={shareAudio}
                  disabled={
                    !canCaptureAudio ||
                    (isScreensharing && !screenShareSession?.audioTrack)
                  }
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setShareAudio(next);
                    void storage.save("call_screen_share_audio", next);
                  }}
                />
                <Label htmlFor="screen-share-audio">Share audio</Label>
              </div>
              {isScreensharing ? (
                <Button variant="destructive" onClick={() => void stop()}>
                  Stop
                </Button>
              ) : (
                <Button
                  disabled={isScreensharing}
                  onClick={() => {
                    setMenuOpen(false);
                    void beginScreenShare();
                  }}
                >
                  Start
                </Button>
              )}
            </div>
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

      {dialogOpen ? (
        <MediaShareDialog
          kind="screen"
          open
          onOpenChange={setDialogOpen}
          portalContainer={portalContainer}
        />
      ) : null}
    </>
  );
}
