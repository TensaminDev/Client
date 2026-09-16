import { Track, type Participant } from "livekit-client";

export function getTrackPublicationBySource(
  participant: Participant | undefined,
  source: Track.Source,
) {
  if (!participant) return undefined;

  return [...participant.trackPublications.values()].find(
    (publication) => publication.source === source,
  );
}
