import { Button } from "@methanium/ui";
import { toast } from "@tensamin/shared/log";
import { Camera, CameraOff } from "lucide-react";
import { startCameraShare, stopCameraShare, useCall } from "../../store";
import {
  type CallButtonProps,
  iconScale,
  withButtonTooltip,
} from "./tooltipButton";

export default function CameraShareButton({
  className,
  iconSize,
  tooltip,
  portalContainer,
}: CallButtonProps) {
  const enabled = useCall((state) => state.cameraEnabled);

  const button = (
    <Button
      className={className}
      variant={enabled ? "subtleDefault" : "default"}
      onClick={() => {
        void (enabled ? stopCameraShare() : startCameraShare()).catch(
          (error) => {
            console.error("Failed to toggle camera sharing", error);
            toast("error", "Failed to toggle camera sharing.");
          },
        );
      }}
    >
      {enabled ? (
        <CameraOff style={iconScale(iconSize)} />
      ) : (
        <Camera style={iconScale(iconSize)} />
      )}
    </Button>
  );

  return withButtonTooltip(button, tooltip, portalContainer);
}
