import { VideoTrack, useParticipantTracks } from "@livekit/components-react";
import { TrackPublication } from "livekit-client";
import { useCall } from "../store";
import { cn } from "@tensamin/ui";
import { Loader2 } from "lucide-react";

export default function VideoViewer({
  className,
  fill = false,
  flush = false,
  publication,
  participantId,
}: {
  className?: string;
  fill?: boolean;
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

  if (!trackRef) return <Loader2 className="animate-spin" />;

  return (
    <VideoTrack
      trackRef={trackRef}
      className={cn(
        fill ? "w-full h-full bg-black" : "w-full h-full aspect-video bg-black",
        flush ? "rounded-none" : "rounded-md",
        className,
      )}
    />
  );
}
