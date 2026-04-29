import { LeaveIcon } from "@livekit/components-react";
import { Button } from "@tensamin/ui";
import { disconnect } from "../../store";

export default function LeaveButton({
  className,
  iconSize,
}: {
  className?: string;
  iconSize?: number;
}) {
  return (
    <Button
      className={className}
      onClick={() => disconnect()}
      variant="destructive"
    >
      <LeaveIcon style={{ scale: (iconSize ? iconSize + 100 : 100) + "%" }} />
    </Button>
  );
}
