import { Button, useOnboardingStep } from "@methanium/ui";
import { useCallback, useState } from "react";
import { SettingsProfileMenu } from "./profileMenu";
import { useSettingsProfiles } from "./profiles";

export function SettingsProfileOnboarding() {
  const { activeProfile, loading, error, selectProfile, continueLocal, retry } =
    useSettingsProfiles();
  const [busy, setBusy] = useState(false);

  const continueWithProfile = useCallback(async () => {
    if (!activeProfile?.available || busy) return false;
    setBusy(true);
    try {
      await selectProfile(activeProfile.id);
    } finally {
      setBusy(false);
    }
  }, [activeProfile, busy, selectProfile]);

  useOnboardingStep({
    canContinue: Boolean(activeProfile?.available) && !loading && !busy,
    onContinue: continueWithProfile,
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-17rem)] w-full max-w-3xl items-center justify-center gap-5 p-4 py-16 md:min-h-[calc(100dvh-22rem)] md:p-16">
      <div className="flex flex-col gap-2 md:max-w-2/3">
        <p className="text-muted-foreground">
          Pick the settings profile to use on this device. Its theme and
          preferences will be applied before the app opens.
        </p>
        {!error && <SettingsProfileMenu />}
        {error && (
          <div className="flex flex-col gap-3 rounded-lg border border-destructive/50 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void retry()}>
                Retry
              </Button>
              <Button onClick={() => void continueLocal()}>
                Continue with local settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
