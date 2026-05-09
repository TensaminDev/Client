import { useEffect, useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@tensamin/ui";
import { MonitorDot, ScreenShare } from "lucide-react";
import { toast } from "@tensamin/shared/log";
import { isTauri } from "@tauri-apps/api/core";
import { setScreenShareEnabled, useCall } from "../../store";
import ScreenShareDialog from "../screenshareDialog";

export default function ScreenshareButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const isScreensharing = useCall((state) => state.screenShareEnabled);
  const screenRef = useCall((state) => state.screenRef);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setPortalContainer(screenRef?.current ?? undefined);
  }, [screenRef]);

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
        <PopoverContent
          className="flex w-40 flex-col gap-2"
          portalProps={{ container: portalContainer }}
        >
          <Button
            disabled={isScreensharing}
            onClick={() => {
              setMenuOpen(false);

              if (isTauri()) {
                setDialogOpen(true);
                return;
              }

              void startWebShare();
            }}
          >
            Start screenshare
          </Button>
          <Button
            variant="destructive"
            disabled={!isScreensharing}
            onClick={() => {
              setMenuOpen(false);
              void stopShare();
            }}
          >
            Stop screenshare
          </Button>
          <Button variant="outline">Change quality</Button>
        </PopoverContent>
      </Popover>

      {isTauri() && (
        <ScreenShareDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          isScreensharing={isScreensharing}
          portalContainer={portalContainer}
        />
      )}
    </>
  );
}
