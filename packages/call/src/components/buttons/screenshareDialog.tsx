import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@tensamin/ui";
import {
  type DesktopScreenShareAudioOutput,
  type DesktopScreenShareCapabilities,
  type DesktopScreenShareSource,
  useDesktopMedia,
} from "@tensamin/tauri/context";
import { toast } from "@tensamin/shared/log";
import { AppWindow, Loader2, MonitorUp } from "lucide-react";
import type { ScreenShareCaptureOptions } from "livekit-client";
import {
  setScreenShareEnabled,
  startLinuxDesktopScreenShare,
} from "../../store";

const NONE_AUDIO_OUTPUT = "__none__";

function buildScreenShareOptions(
  source: DesktopScreenShareSource,
  capabilities: DesktopScreenShareCapabilities,
  selectedAudioOutputId: string,
  shareAudio: boolean,
): ScreenShareCaptureOptions {
  const wantsAudio = capabilities.usesPipeWireAudioPicker
    ? selectedAudioOutputId !== NONE_AUDIO_OUTPUT
    : capabilities.supportsReliableSystemAudio && shareAudio;

  return {
    audio: wantsAudio
      ? {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        }
      : false,
    video: {
      displaySurface: source.kind === "window" ? "window" : "monitor",
    },
    systemAudio: wantsAudio ? "include" : "exclude",
    surfaceSwitching: "exclude",
    selfBrowserSurface: "exclude",
    contentHint: "detail",
  };
}

export default function ScreenShareDialog({
  open,
  onOpenChange,
  isScreensharing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isScreensharing: boolean;
}) {
  const {
    getScreenShareCapabilities,
    listScreenShareAudioOutputs,
    listScreenShareSources,
  } = useDesktopMedia();

  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<DesktopScreenShareSource[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DesktopScreenShareAudioOutput[]>(
    [],
  );
  const [capabilities, setCapabilities] =
    useState<DesktopScreenShareCapabilities | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedAudioOutputId, setSelectedAudioOutputId] =
    useState<string>(NONE_AUDIO_OUTPUT);
  const [shareAudio, setShareAudio] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    setLoading(true);
    setSelectedSourceId(null);
    setSelectedAudioOutputId(NONE_AUDIO_OUTPUT);
    setShareAudio(false);

    Promise.all([listScreenShareSources(), getScreenShareCapabilities()])
      .then(async ([nextSources, nextCapabilities]) => {
        if (!active) {
          return;
        }

        setSources(nextSources);
        setCapabilities(nextCapabilities);

        if (nextCapabilities.usesPipeWireAudioPicker) {
          const nextOutputs = await listScreenShareAudioOutputs();

          if (!active) {
            return;
          }

          setAudioOutputs(nextOutputs);
        } else {
          setAudioOutputs([]);
        }
      })
      .catch((error) => {
        console.error("Failed to load desktop share sources", error);
        toast("error", "Failed to load screen share sources.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    getScreenShareCapabilities,
    listScreenShareAudioOutputs,
    listScreenShareSources,
    open,
  ]);

  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ?? null;

  async function startSharing() {
    if (!selectedSource || !capabilities) {
      return;
    }

    setLoading(true);

    try {
      if (capabilities.platform === "linux") {
        await startLinuxDesktopScreenShare(selectedSource.id);
      } else {
        await setScreenShareEnabled(
          true,
          buildScreenShareOptions(
            selectedSource,
            capabilities,
            selectedAudioOutputId,
            shareAudio,
          ),
        );
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to start screen share", error);
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to start screen sharing.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function stopSharing() {
    setLoading(true);

    try {
      await setScreenShareEnabled(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to stop screen share", error);
      toast("error", "Failed to stop screen sharing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>Share your screen</DialogTitle>
          <DialogDescription>
            Pick the window or display you want to share with the call.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((source) => {
              const selected = source.id === selectedSourceId;

              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setSelectedSourceId(source.id)}
                  className={[
                    "flex min-h-28 flex-col justify-between rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {source.kind === "window" ? (
                      <AppWindow className="size-4" />
                    ) : (
                      <MonitorUp className="size-4" />
                    )}
                    {source.name}
                  </div>
                  {source.subtitle && (
                    <p className="text-xs text-muted-foreground">
                      {source.subtitle}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {!loading && sources.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No windows or displays are currently available for capture.
            </p>
          )}

          {capabilities?.usesPipeWireAudioPicker ? (
            <div className="flex flex-col gap-2">
              <Label>Share audio output</Label>
              <Select
                value={selectedAudioOutputId}
                onValueChange={(value) =>
                  setSelectedAudioOutputId(value ?? NONE_AUDIO_OUTPUT)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_AUDIO_OUTPUT}>None</SelectItem>
                  {audioOutputs.map((output) => (
                    <SelectItem key={output.id} value={output.id}>
                      {output.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select a PipeWire output to try sharing system audio with your
                screen.
              </p>
            </div>
          ) : capabilities?.supportsSystemAudioSwitch ? (
            <div className="flex flex-col gap-2 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="share-system-audio">Share audio</Label>
                  <p className="text-xs text-muted-foreground">
                    Share system audio alongside your screen when the runtime can
                    provide it.
                  </p>
                </div>
                <Switch
                  id="share-system-audio"
                  checked={shareAudio}
                  disabled={!capabilities.supportsReliableSystemAudio}
                  onCheckedChange={setShareAudio}
                />
              </div>
              {!capabilities.supportsReliableSystemAudio && (
                <p className="text-xs text-muted-foreground">
                  System audio sharing is not available on this platform/runtime
                  yet.
                </p>
              )}
            </div>
          ) : null}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading available share targets...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {isScreensharing && (
            <Button variant="destructive" disabled={loading} onClick={stopSharing}>
              Stop sharing
            </Button>
          )}
          <Button
            disabled={loading || selectedSource == null}
            onClick={startSharing}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Start sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
