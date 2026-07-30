import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@methanium/ui";
import { settingsStorageDefaults } from "@tensamin/shared/settings";
import { useStorage } from "@tensamin/storage/context";
import { useEffect, useState } from "react";

type CallJingle = (typeof settingsStorageDefaults)["settings.call_jingle"];

const jingleLabels: Record<CallJingle, string> = {
  jingle_1: "Jingle 1",
  jingle_2: "Jingle 2",
};

export default function Page() {
  const { load, save } = useStorage();
  const [jingle, setJingle] = useState<CallJingle>(
    settingsStorageDefaults["settings.call_jingle"],
  );

  useEffect(() => {
    void load("settings.call_jingle").then(setJingle);
  }, [load]);

  return (
    <div className="flex max-w-md flex-col gap-2">
      <Label htmlFor="call-jingle">Outgoing call jingle</Label>
      <Select
        value={jingle}
        onValueChange={(value) => {
          const nextJingle = value ?? "jingle_1";
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
    </div>
  );
}
