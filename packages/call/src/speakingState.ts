import { create } from "zustand";

type SpeakingState = {
  speakingParticipantIds: Set<number>;
  micGated: boolean;
};

const useSpeakingState = create<SpeakingState>(() => ({
  speakingParticipantIds: new Set(),
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
    if (!state.speakingParticipantIds.has(participantId)) return state;
    const next = new Set(state.speakingParticipantIds);
    next.delete(participantId);
    return { speakingParticipantIds: next };
  });
}

export function updateSpeakingParticipants(changed: Map<number, boolean>) {
  useSpeakingState.setState((state) => {
    let hasDiff = false;
    const next = new Set(state.speakingParticipantIds);

    for (const [id, speaking] of changed) {
      if (speaking) {
        if (!next.has(id)) {
          next.add(id);
          hasDiff = true;
        }
      } else if (next.has(id)) {
        next.delete(id);
        hasDiff = true;
      }
    }

    return hasDiff ? { speakingParticipantIds: next } : state;
  });
}

export function useIsSpeaking(participantId: number): boolean {
  return useSpeakingState((state) =>
    state.speakingParticipantIds.has(participantId),
  );
}
