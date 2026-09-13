import { SettingsSidebar } from "../sidebar";
import { useSettingsProfiles } from "../profiles";
import { Button } from "@methanium/ui";
import { RotateCcw } from "lucide-react";
import { SettingsProfileMenu } from "../profileMenu";

export default function Page() {
  const { syncError, remoteChange, reloadRemote, keepLocal, retrySave } =
    useSettingsProfiles();
  return (
    <div className="h-full md:hidden! flex flex-col">
      <SettingsSidebar mobile />
      <div className="mt-auto flex flex-col gap-2">
        {syncError && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>Local changes are not synced. {syncError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retrySave()}
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void reloadRemote()}
            >
              Reload remote
            </Button>
          </div>
        )}
        {remoteChange && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <span>
              This profile was{" "}
              {remoteChange === "deleted" ? "deleted" : "updated"} elsewhere.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void reloadRemote()}
            >
              <RotateCcw className="size-4" /> Reload
            </Button>
            <Button size="sm" variant="ghost" onClick={keepLocal}>
              Keep local
            </Button>
          </div>
        )}
        <SettingsProfileMenu />
      </div>
    </div>
  );
}
