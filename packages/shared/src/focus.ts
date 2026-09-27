import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let listening = false;
let focused = getCurrentFocus();

function getCurrentFocus() {
  return (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

function updateFocus() {
  const next = getCurrentFocus();
  if (next === focused) return;
  focused = next;
  for (const listener of listeners) listener();
}

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  focused = getCurrentFocus();
  document.addEventListener("visibilitychange", updateFocus);
  window.addEventListener("focus", updateFocus);
  window.addEventListener("blur", updateFocus);
}

function stopListening() {
  if (!listening || listeners.size !== 0) return;
  listening = false;
  document.removeEventListener("visibilitychange", updateFocus);
  window.removeEventListener("focus", updateFocus);
  window.removeEventListener("blur", updateFocus);
}

export function getAppFocused() {
  focused = getCurrentFocus();
  return focused;
}

export function subscribeAppFocus(listener: () => void) {
  listeners.add(listener);
  startListening();
  return () => {
    listeners.delete(listener);
    stopListening();
  };
}

export function useAppFocused() {
  return useSyncExternalStore(subscribeAppFocus, getAppFocused, () => false);
}
