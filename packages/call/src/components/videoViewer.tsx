import { VideoTrack, useParticipantTracks } from "@livekit/components-react";
import { TrackPublication } from "livekit-client";
import { useCall } from "../store";
import { cn } from "@tensamin/ui";

export default function VideoViewer({
  className,
  flush = false,
  publication,
  participantId,
}: {
  className?: string;
  flush?: boolean;
  publication: TrackPublication;
  participantId: string;
}) {
  const room = useCall((state) => state.room);
  const tracks = useParticipantTracks([publication.source], {
    participantIdentity: participantId,
    room,
  });
  const trackRef = tracks[0];

  if (!trackRef) {
    return null;
  }

  return (
    <VideoTrack
      trackRef={trackRef}
      className={cn(
        "w-full h-full aspect-video bg-black",
        flush ? "rounded-none" : "rounded-md",
        className,
      )}
    />
  );
}
