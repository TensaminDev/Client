import { SettingsSidebar } from "../sidebar";
import { useSettingsProfiles } from "../profiles";
import { Button } from "@nonanium/ui";
import { SettingsProfileMenu } from "../profileMenu";

export default function Page() {
  const { syncError, retrySave } = useSettingsProfiles();
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
          </div>
        )}
        <SettingsProfileMenu />
      </div>
    </div>
  );
}
