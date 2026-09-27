export type SoundName =
  | "call_jingle_1"
  | "call_jingle_2"
  | "call_join"
  | "call_leave"
  | "message"
  | "stream_end_other"
  | "stream_end_self"
  | "stream_start_other"
  | "stream_start_self"
  | "stream_watch_end"
  | "stream_watch_start";

function soundUrl(sound: SoundName) {
  if (window.location.protocol === "file:") {
    return new URL(`./sounds/${sound}.wav`, document.baseURI).href;
  }

  return `/sounds/${sound}.wav`;
}

export function playSound(sound: SoundName, loop = false, volume = 1) {
  const audio = new Audio(soundUrl(sound));
  audio.loop = loop;
  audio.volume = Math.max(0, Math.min(1, volume));
  void audio.play().catch(() => undefined);
  return audio;
}

export function stopSound(audio: HTMLAudioElement | null) {
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
}
