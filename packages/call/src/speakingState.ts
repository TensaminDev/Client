import { create } from "zustand";

const useSpeakingState = create<{
  speakingParticipantIds: Set<number>;
  lastSpeakingParticipantId: number | null;
  micGated: boolean;
}>(() => ({
  speakingParticipantIds: new Set(),
  lastSpeakingParticipantId: null,
  micGated: false,
}));

export function setMicGated(micGated: boolean) {
  useSpeakingState.setState({ micGated });
}

export function clearSpeakingParticipants() {
  useSpeakingState.setState({ speakingParticipantIds: new Set() });
}

export function removeSpeakingParticipant(participantId: number) {
  useSpeakingState.setState((state) => {
    const wasSpeaking = state.speakingParticipantIds.has(participantId);
    const wasLastSpeaking = state.lastSpeakingParticipantId === participantId;

    if (!wasSpeaking && !wasLastSpeaking) return state;

    const next = new Set(state.speakingParticipantIds);
    next.delete(participantId);
    return {
      speakingParticipantIds: next,
      lastSpeakingParticipantId: wasLastSpeaking
        ? null
        : state.lastSpeakingParticipantId,
    };
  });
}

export function updateSpeakingParticipants(changed: Map<number, boolean>) {
  useSpeakingState.setState((state) => {
    let hasDiff = false;
    const next = new Set(state.speakingParticipantIds);
    let lastSpeakingParticipantId = state.lastSpeakingParticipantId;

    for (const [id, speaking] of changed) {
      if (speaking) {
        if (!next.has(id)) {
          next.add(id);
          lastSpeakingParticipantId = id;
          hasDiff = true;
        }
      } else if (next.has(id)) {
        next.delete(id);
        hasDiff = true;
      }
    }

    return hasDiff
      ? { speakingParticipantIds: next, lastSpeakingParticipantId }
      : state;
  });
}

export function useLastSpeakingParticipantId(): number | null {
  return useSpeakingState((state) => state.lastSpeakingParticipantId);
}

export function useIsSpeaking(participantId: number): boolean {
  return useSpeakingState((state) =>
    state.speakingParticipantIds.has(participantId),
  );
}
