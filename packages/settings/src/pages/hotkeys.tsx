import { Button, Kbd } from "@methanium/ui";
import {
  formatForDisplay,
  useHotkeyDefinitions,
  useHotkeyRecorder,
  useHotkeysContext,
  type HotkeyDefinition,
} from "@tensamin/hotkeys";
import { useEffect, useState } from "react";

function HotkeyRow({
  definition,
  conflicts,
  isRecording,
  startRecording,
}: {
  definition: HotkeyDefinition;
  conflicts: string[];
  isRecording: boolean;
  startRecording: () => void;
}) {
  const { bindingFor, setBinding, resetBinding, globalStatuses } =
    useHotkeysContext();
  const binding = bindingFor(definition);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-input p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{definition.name}</p>
          {definition.description && (
            <p className="text-sm text-muted-foreground">
              {definition.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {definition.global
              ? "Global in the Electron desktop app"
              : "Active while its screen or component is available"}
          </p>
        </div>
        <Kbd>{binding ? formatForDisplay(binding) : "Unbound"}</Kbd>
      </div>
      {conflicts.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Also assigned to {conflicts.join(", ")}.
        </p>
      )}
      {definition.global && globalStatuses[definition.id] === "unavailable" && (
        <p className="text-sm text-destructive">
          Electron could not register this shortcut. It may be reserved by the
          operating system or another application.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={startRecording}>
          {isRecording ? "Press a shortcut..." : "Record"}
        </Button>
        <Button
          variant="outline"
          disabled={binding === null}
          onClick={() => setBinding(definition, null)}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          disabled={binding === definition.defaultBinding}
          onClick={() => resetBinding(definition)}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}

export default function Page() {
  const definitions = useHotkeyDefinitions();
  const { bindingFor, resetAll, setBinding, setRecording } =
    useHotkeysContext();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const categories = [...new Set(definitions.map(({ category }) => category))];
  const recorder = useHotkeyRecorder({
    ignoreInputs: false,
    onRecord: (hotkey) => {
      const definition = definitions.find(({ id }) => id === recordingId);
      if (definition) setBinding(definition, hotkey || null);
      setRecordingId(null);
      setRecording(false);
    },
    onCancel: () => {
      setRecordingId(null);
      setRecording(false);
    },
  });

  useEffect(() => () => setRecording(false), [setRecording]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Click Record, then press the replacement shortcut. Conflicting
          shortcuts are allowed and will run together when their scopes overlap.
        </p>
        <Button variant="outline" onClick={resetAll}>
          Reset All
        </Button>
      </div>
      {categories.map((category) => (
        <section className="flex flex-col gap-3" key={category}>
          <h2 className="text-lg font-semibold">{category}</h2>
          {definitions
            .filter((definition) => definition.category === category)
            .map((definition) => {
              const binding = bindingFor(definition);
              const conflicts = binding
                ? definitions
                    .filter(
                      (candidate) =>
                        candidate.id !== definition.id &&
                        bindingFor(candidate) === binding,
                    )
                    .map(({ name }) => name)
                : [];
              return (
                <HotkeyRow
                  conflicts={conflicts}
                  definition={definition}
                  isRecording={
                    recordingId === definition.id && recorder.isRecording
                  }
                  key={definition.id}
                  startRecording={() => {
                    setRecordingId(definition.id);
                    setRecording(true);
                    recorder.startRecording();
                  }}
                />
              );
            })}
        </section>
      ))}
      {definitions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No configurable hotkeys are registered.
        </p>
      )}
    </div>
  );
}
