import { create } from "zustand";

const useSpeakingState = create<{
  speakingParticipantIds: Set<number>;
  recentSpeakerIds: number[];
  lastSpeakingParticipantId: number | null;
  micGated: boolean;
}>(() => ({
  speakingParticipantIds: new Set(),
  recentSpeakerIds: [],
  lastSpeakingParticipantId: null,
  micGated: false,
}));

export function setMicGated(micGated: boolean) {
  useSpeakingState.setState({ micGated });
}

export function clearSpeakingParticipants(clearHistory = false) {
  useSpeakingState.setState(
    clearHistory
      ? {
          speakingParticipantIds: new Set(),
          recentSpeakerIds: [],
          lastSpeakingParticipantId: null,
        }
      : { speakingParticipantIds: new Set() },
  );
}

export function removeSpeakingParticipant(participantId: number) {
  useSpeakingState.setState((state) => {
    const wasSpeaking = state.speakingParticipantIds.has(participantId);

    if (!wasSpeaking) return state;

    const next = new Set(state.speakingParticipantIds);
    next.delete(participantId);
    return { speakingParticipantIds: next };
  });
}

export function forgetSpeakingParticipant(participantId: number) {
  useSpeakingState.setState((state) => {
    const recentSpeakerIds = state.recentSpeakerIds.filter(
      (id) => id !== participantId,
    );

    return {
      speakingParticipantIds: new Set(
        [...state.speakingParticipantIds].filter((id) => id !== participantId),
      ),
      recentSpeakerIds,
      lastSpeakingParticipantId:
        state.lastSpeakingParticipantId === participantId
          ? (recentSpeakerIds[0] ?? null)
          : state.lastSpeakingParticipantId,
    };
  });
}

export function updateSpeakingParticipants(changed: Map<number, boolean>) {
  useSpeakingState.setState((state) => {
    let hasDiff = false;
    const next = new Set(state.speakingParticipantIds);
    let recentSpeakerIds = state.recentSpeakerIds;
    let lastSpeakingParticipantId = state.lastSpeakingParticipantId;

    for (const [id, speaking] of changed) {
      if (speaking) {
        if (!next.has(id)) {
          next.add(id);
          recentSpeakerIds = [
            id,
            ...recentSpeakerIds.filter((entry) => entry !== id),
          ];
          lastSpeakingParticipantId = id;
          hasDiff = true;
        }
      } else if (next.has(id)) {
        next.delete(id);
        hasDiff = true;
      }
    }

    return hasDiff
      ? {
          speakingParticipantIds: next,
          recentSpeakerIds,
          lastSpeakingParticipantId,
        }
      : state;
  });
}

export function useRecentSpeakerIds(): number[] {
  return useSpeakingState((state) => state.recentSpeakerIds);
}

export function useLastSpeakingParticipantId(): number | null {
  return useSpeakingState((state) => state.lastSpeakingParticipantId);
}

export function useIsSpeaking(participantId: number): boolean {
  return useSpeakingState((state) =>
    state.speakingParticipantIds.has(participantId),
  );
}
