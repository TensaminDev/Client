import {
  HotkeysProvider as TanStackHotkeysProvider,
  useHotkeys as useTanStackHotkeys,
  type Hotkey,
  type UseHotkeyOptions,
} from "@tanstack/react-hotkeys";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStorage } from "@tensamin/storage/context";
import {
  getHotkeyDefinitions,
  normalizeHotkeyOverrides,
  toElectronAccelerator,
  type HotkeyDefinition,
} from "./registry";

type GlobalRegistrationStatus = "registered" | "unavailable";

type HotkeysContextValue = {
  overrides: Record<string, Hotkey | null>;
  bindingFor: (definition: HotkeyDefinition) => Hotkey | null;
  setBinding: (definition: HotkeyDefinition, binding: Hotkey | null) => void;
  resetBinding: (definition: HotkeyDefinition) => void;
  resetAll: () => void;
  globalStatuses: Record<string, GlobalRegistrationStatus>;
  setRecording: (recording: boolean) => void;
  registerGlobalHandler: (
    definition: HotkeyDefinition,
    handler: () => void,
  ) => () => void;
};

const HotkeysContext = createContext<HotkeysContextValue | undefined>(
  undefined,
);

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const { load, save, subscribe } = useStorage();
  const [overrides, setOverrides] = useState<Record<string, Hotkey | null>>({});
  const [handlersRevision, setHandlersRevision] = useState(0);
  const [globalStatuses, setGlobalStatuses] = useState<
    Record<string, GlobalRegistrationStatus>
  >({});
  const handlers = useRef(new Map<string, Set<() => void>>());
  const overridesRef = useRef<Record<string, Hotkey | null>>({});

  const [profileRevision, setProfileRevision] = useState(0);
  useEffect(
    () =>
      subscribe((keys, bulk) => {
        if (bulk && keys.includes("hotkey_overrides")) {
          setProfileRevision((revision) => revision + 1);
        }
      }),
    [subscribe],
  );

  useEffect(() => {
    let active = true;
    void load("hotkey_overrides")
      .then((stored) => {
        if (!active) return;
        const next = normalizeHotkeyOverrides(stored);
        overridesRef.current = next;
        setOverrides(next);
      })
      .catch((error: unknown) => {
        console.error("Failed to load hotkey settings", error);
      });
    return () => {
      active = false;
    };
  }, [load, profileRevision]);

  const persist = useCallback(
    (next: Record<string, Hotkey | null>) => {
      overridesRef.current = next;
      setOverrides(next);
      void save("hotkey_overrides", next).catch((error: unknown) => {
        console.error("Failed to save hotkey settings", error);
      });
    },
    [save],
  );

  const bindingFor = useCallback(
    (definition: HotkeyDefinition) =>
      Object.hasOwn(overrides, definition.id)
        ? (overrides[definition.id] ?? null)
        : definition.defaultBinding,
    [overrides],
  );

  const setBinding = useCallback(
    (definition: HotkeyDefinition, binding: Hotkey | null) => {
      const next = { ...overridesRef.current };
      if (binding === definition.defaultBinding) delete next[definition.id];
      else next[definition.id] = binding;
      persist(next);
    },
    [persist],
  );

  const resetBinding = useCallback(
    (definition: HotkeyDefinition) => {
      const next = { ...overridesRef.current };
      delete next[definition.id];
      persist(next);
    },
    [persist],
  );

  const resetAll = useCallback(() => persist({}), [persist]);

  const registerGlobalHandler = useCallback(
    (definition: HotkeyDefinition, handler: () => void) => {
      const current = handlers.current.get(definition.id) ?? new Set();
      current.add(handler);
      handlers.current.set(definition.id, current);
      setHandlersRevision((revision) => revision + 1);
      return () => {
        current.delete(handler);
        if (current.size === 0) handlers.current.delete(definition.id);
        setHandlersRevision((revision) => revision + 1);
      };
    },
    [],
  );

  useEffect(() => {
    return window.tensaminDesktop?.hotkeys?.onTriggered?.((id) => {
      handlers.current.get(id)?.forEach((handler) => handler());
    });
  }, []);

  useEffect(() => {
    const desktopHotkeys = window.tensaminDesktop?.hotkeys;
    if (!desktopHotkeys?.setBindings) return;

    const unsupported: string[] = [];
    const registrations = getHotkeyDefinitions().flatMap((definition) => {
      if (!definition.global || !handlers.current.has(definition.id)) return [];
      const binding = bindingFor(definition);
      const accelerator = binding && toElectronAccelerator(binding);
      if (binding && !accelerator) unsupported.push(definition.id);
      return accelerator ? [{ id: definition.id, accelerator }] : [];
    });
    let active = true;
    void desktopHotkeys
      .setBindings(registrations)
      .then((statuses) => {
        if (!active) return;
        setGlobalStatuses(
          Object.fromEntries(
            [
              ...unsupported.map((id) => [id, false] as const),
              ...Object.entries(statuses),
            ].map(([id, registered]) => [
              id,
              registered ? "registered" : "unavailable",
            ]),
          ),
        );
      })
      .catch((error: unknown) => {
        console.error("Failed to register global hotkeys", error);
      });
    return () => {
      active = false;
    };
  }, [bindingFor, handlersRevision]);

  const setRecording = useCallback((recording: boolean) => {
    void window.tensaminDesktop?.hotkeys
      ?.setSuspended?.(recording)
      .catch((error: unknown) => {
        console.error("Failed to suspend global hotkeys", error);
      });
  }, []);

  const value = useMemo<HotkeysContextValue>(
    () => ({
      overrides,
      bindingFor,
      setBinding,
      resetBinding,
      resetAll,
      globalStatuses,
      setRecording,
      registerGlobalHandler,
    }),
    [
      bindingFor,
      globalStatuses,
      overrides,
      registerGlobalHandler,
      resetAll,
      resetBinding,
      setBinding,
      setRecording,
    ],
  );

  return (
    <TanStackHotkeysProvider>
      <HotkeysContext value={value}>{children}</HotkeysContext>
    </TanStackHotkeysProvider>
  );
}

export function useHotkeysContext() {
  const value = useContext(HotkeysContext);
  if (!value)
    throw new Error("useHotkeysContext must be used within HotkeysProvider");
  return value;
}

export function useHotkey(
  definition: HotkeyDefinition,
  callback: () => void,
  options: UseHotkeyOptions = {},
) {
  const { bindingFor, registerGlobalHandler } = useHotkeysContext();
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  const binding = bindingFor(definition);
  const handledByElectron = Boolean(
    definition.global && window.tensaminDesktop?.hotkeys,
  );

  useTanStackHotkeys(
    binding && !handledByElectron && options.enabled !== false
      ? [
          {
            hotkey: binding,
            callback: () => callbackRef.current(),
            options: {
              ...options,
              meta: {
                name: definition.name,
                description: definition.description,
              },
            },
          },
        ]
      : [],
  );

  useEffect(() => {
    if (!definition.global || options.enabled === false || !binding) return;
    return registerGlobalHandler(definition, () => callbackRef.current());
  }, [binding, definition, options.enabled, registerGlobalHandler]);
}
