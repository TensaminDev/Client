import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@methanium/ui";
import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { playSound, stopSound } from "@tensamin/shared/sounds";
import { useStorage } from "@tensamin/storage/context";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CallJingle = (typeof settingsStorageDefaults)["settings.call_jingle"];

const jingleLabels: Record<CallJingle, string> = {
  jingle_1: "Jingle 1",
  jingle_2: "Jingle 2",
};

export default function Page() {
  const { load, save } = useStorage();
  const preview = useRef<HTMLAudioElement>(null);
  const [jingle, setJingle] = useState<CallJingle>(
    settingsStorageDefaults["settings.call_jingle"],
  );
  const [isPreviewing, setIsPreviewing] = useState(false);

  function stopPreview() {
    stopSound(preview.current);
    preview.current = null;
    setIsPreviewing(false);
  }

  useEffect(() => {
    void load("settings.call_jingle").then(setJingle);
  }, [load]);

  useEffect(() => () => stopSound(preview.current), []);

  return (
    <div className="flex max-w-md flex-col gap-2">
      <Label htmlFor="call-jingle">Outgoing call jingle</Label>
      <div className="flex gap-2">
        <Select
          value={jingle}
          onValueChange={(value) => {
            const nextJingle = value ?? "jingle_1";
            stopPreview();
            setJingle(nextJingle);
            void save("settings.call_jingle", nextJingle);
          }}
        >
          <SelectTrigger className="w-full" id="call-jingle">
            <SelectValue>{jingleLabels[jingle]}</SelectValue>
          </SelectTrigger>
          <SelectContent className="p-1">
            <SelectItem value="jingle_1">Jingle 1</SelectItem>
            <SelectItem value="jingle_2">Jingle 2</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          aria-label={isPreviewing ? "Stop jingle preview" : "Preview jingle"}
          title={isPreviewing ? "Stop preview" : "Preview jingle"}
          onClick={() => {
            if (isPreviewing) {
              stopPreview();
              return;
            }

            const audio = playSound(
              jingle === "jingle_2" ? "call_jingle_2" : "call_jingle_1",
            );
            preview.current = audio;
            setIsPreviewing(true);
            audio.addEventListener(
              "ended",
              () => {
                if (preview.current === audio) stopPreview();
              },
              { once: true },
            );
          }}
        >
          {isPreviewing ? <Square /> : <Play />}
        </Button>
      </div>
    </div>
  );
}
