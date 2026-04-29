import { Card, CardContent } from "@tensamin/ui";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import ScreenshareButton from "./buttons/screenshare";
import LeaveButton from "./buttons/leave";

export default function Actions() {
  const sharedClasses = "w-14 h-10";
  const sharedIconSize = 15;

  return (
    <div className="w-full flex justify-center py-3">
      <Card className="p-1.75">
        <CardContent className="p-0! flex gap-1.75">
          <MuteButton className={sharedClasses} iconSize={sharedIconSize} />
          <DeafButton className={sharedClasses} iconSize={sharedIconSize} />
          <ScreenshareButton
            className={sharedClasses}
            iconSize={sharedIconSize}
          />
          <LeaveButton className={sharedClasses} iconSize={sharedIconSize} />
        </CardContent>
      </Card>
    </div>
  );
}
