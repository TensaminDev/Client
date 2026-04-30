import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import { MonitorDot, ScreenShare } from "lucide-react";
import { toast } from "@tensamin/shared/log";
import { useDesktopMedia } from "@tensamin/tauri/context";
import { setScreenShareEnabled, useCall } from "../../store";
import ScreenShareDialog from "./screenshareDialog";

export default function ScreenshareButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const isScreensharing = useCall((state) => state.screenShareEnabled);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDesktopTauri } = useDesktopMedia();

  async function startWebShare() {
    try {
      await setScreenShareEnabled(true, {
        audio: true,
        systemAudio: "include",
        surfaceSwitching: "include",
        video: true,
      });
    } catch (error) {
      console.error("Failed to start web screen share", error);
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to start screen sharing.",
      );
    }
  }

  async function stopShare() {
    try {
      await setScreenShareEnabled(false);
    } catch (error) {
      console.error("Failed to stop screen share", error);
      toast("error", "Failed to stop screen sharing.");
    }
  }

  return (
    <>
      <Popover onOpenChange={setMenuOpen} open={menuOpen}>
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
        <PopoverContent className="flex w-52 flex-col gap-2">
          <Button
            disabled={isScreensharing}
            onClick={() => {
              setMenuOpen(false);

              if (isDesktopTauri) {
                setDialogOpen(true);
                return;
              }

              void startWebShare();
            }}
          >
            Start sharing
          </Button>
          <Button
            variant="destructive"
            disabled={!isScreensharing}
            onClick={() => {
              setMenuOpen(false);
              void stopShare();
            }}
          >
            Stop sharing
          </Button>
          <Button disabled variant="outline">
            Stream quality soon
          </Button>
        </PopoverContent>
      </Popover>

      {isDesktopTauri && (
        <ScreenShareDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          isScreensharing={isScreensharing}
        />
      )}
    </>
  );
}
