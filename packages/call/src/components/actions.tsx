import { Card, CardContent } from "@tensamin/ui";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import ScreenshareButton from "./buttons/screenshare";
import LeaveButton from "./buttons/leave";

export default function Actions() {
  return (
    <div className="w-full flex justify-center py-3">
      <Card className="p-1.75">
        <CardContent className="p-0! flex gap-1.75">
          <MuteButton className="w-14 h-10" iconSize={25} />
          <DeafButton className="w-14 h-10" iconSize={25} />
          <ScreenshareButton className="w-14 h-10" iconSize={25} />
          <LeaveButton className="w-14 h-10" iconSize={25} />
        </CardContent>
      </Card>
    </div>
  );
}
