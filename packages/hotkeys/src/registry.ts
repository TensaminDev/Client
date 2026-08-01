import { useSyncExternalStore } from "react";
import { validateHotkey, type Hotkey } from "@tanstack/react-hotkeys";

export type HotkeyDefinition = Readonly<{
  id: string;
  name: string;
  description?: string;
  category: string;
  defaultBinding: Hotkey;
  global?: boolean;
}>;

const definitions = new Map<string, HotkeyDefinition>();
const listeners = new Set<() => void>();
let snapshot: HotkeyDefinition[] = [];

export function defineHotkey(definition: HotkeyDefinition) {
  const existing = definitions.get(definition.id);
  if (existing) return existing;

  definitions.set(definition.id, Object.freeze({ ...definition }));
  snapshot = [...definitions.values()];
  listeners.forEach((listener) => listener());
  return definitions.get(definition.id)!;
}

export function getHotkeyDefinitions() {
  return snapshot;
}

export function useHotkeyDefinitions() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getHotkeyDefinitions,
    getHotkeyDefinitions,
  );
}

export function normalizeHotkeyOverrides(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, binding]) =>
        id.length > 0 &&
        id.length <= 128 &&
        (binding === null ||
          (typeof binding === "string" &&
            binding.length > 0 &&
            binding.length <= 128 &&
            validateHotkey(binding).valid)),
    ),
  ) as Record<string, Hotkey | null>;
}

export function toElectronAccelerator(hotkey: Hotkey) {
  const keyAliases: Record<string, string> = {
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    " ": "Space",
  };
  const modifierAliases: Record<string, string> = {
    Alt: "Alt",
    Control: "Control",
    Ctrl: "Control",
    Meta: "Command",
    Mod: "CommandOrControl",
    Shift: "Shift",
  };
  const parts = hotkey.split("+");
  if (parts.length === 0) return null;

  const key = parts.at(-1)!;
  const modifiers = parts.slice(0, -1).map((part) => modifierAliases[part]);
  if (modifiers.some((part) => !part)) return null;

  const acceleratorKey = keyAliases[key] ?? key;
  if (
    !/^[A-Za-z0-9]$/.test(acceleratorKey) &&
    !keyAliases[key] &&
    !/^(Backspace|Delete|End|Enter|Escape|F([1-9]|1[0-9]|2[0-4])|Home|PageDown|PageUp|Space|Tab)$/.test(
      acceleratorKey,
    )
  ) {
    return null;
  }

  return [...modifiers, acceleratorKey].join("+");
}
