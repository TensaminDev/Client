import { LeaveIcon } from "@livekit/components-react";
import { Button } from "@tensamin/ui";
import { disconnect, useCall } from "../../store";

export default function LeaveButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  const state = useCall((store) => store.state);

  return (
    <Button
      className={className}
      onClick={() => disconnect()}
      disabled={state === "closing" || state === "closed"}
      variant="destructive"
    >
      <LeaveIcon style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
    </Button>
  );
}
