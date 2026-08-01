export { HotkeysProvider, useHotkey, useHotkeysContext } from "./context";
export {
  defineHotkey,
  getHotkeyDefinitions,
  normalizeHotkeyOverrides,
  toElectronAccelerator,
  useHotkeyDefinitions,
  type HotkeyDefinition,
} from "./registry";
export {
  formatForDisplay,
  useHotkeyRecorder,
  type Hotkey,
} from "@tanstack/react-hotkeys";
