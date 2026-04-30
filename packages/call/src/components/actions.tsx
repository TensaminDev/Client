import { Card, CardContent, Button } from "@tensamin/ui";
import MuteButton from "./buttons/mute";
import DeafButton from "./buttons/deaf";
import ScreenshareButton from "./buttons/screenshare";
import LeaveButton from "./buttons/leave";
import { stopWatchingFocusedStream, useCall } from "../store";
import InviteButton from "./buttons/invite";

export default function Actions() {
  const sharedClasses = "w-14 h-10";
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

  return (
    <div className="w-full flex justify-center">
      <Card className="p-1.75">
        <CardContent className="p-0! flex gap-1.75">
          <MuteButton className={sharedClasses} iconSize={sharedIconSize} />
          <DeafButton className={sharedClasses} iconSize={sharedIconSize} />
          <ScreenshareButton
            className={sharedClasses}
            iconSize={sharedIconSize}
          />
          <InviteButton className={sharedClasses} iconSize={sharedIconSize} />
          {isWatchingFocusedStream ? (
            <Button
              className="h-10"
              variant="destructive"
              onClick={() => stopWatchingFocusedStream()}
            >
              Stop watching
            </Button>
          ) : (
            <LeaveButton className={sharedClasses} iconSize={sharedIconSize} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
