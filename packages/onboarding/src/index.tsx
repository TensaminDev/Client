import { useCallback, useEffect, useState, type ReactNode } from "react";
import { OnboardingFlow, type OnboardingStep } from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import { useSettingsProfiles } from "@tensamin/settings/profiles";
import { isTauri } from "@tauri-apps/api/core";

import { onboardingSteps } from "./steps";
import TauriPermissionsPage from "./pages/tauriPermissions";
import LegalPage from "./pages/legal";

export {
  useOnboardingStep,
  type OnboardingStep,
  type OnboardingStepControls,
} from "@methanium/ui";

export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { load, save } = useStorage();
  const {
    themePromptCompleted,
    completeThemePrompt,
    loading,
    legalRequired,
    legalChanged,
    legalError,
    retryLegal,
    acceptLegal,
  } = useSettingsProfiles();
  const [ready, setReady] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [tauriPermissions, setTauriPermissions] = useState(false);
  const [complete, setComplete] = useState(false);
  const [themeSkipped, setThemeSkipped] = useState(false);
  const [onboardingThemeId, setOnboardingThemeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    void Promise.all([
      load("onboarding_done"),
      load("tauri_permissions_done"),
    ]).then(([onboardingDone, tauriPermissionsDone]) => {
      setOnboarding(!onboardingDone);
      setTauriPermissions(
        isTauri() &&
          /Android/.test(navigator.userAgent) &&
          !tauriPermissionsDone,
      );
      setReady(true);
    });
  }, [load]);

  const finish = useCallback(async () => {
    if (!themePromptCompleted) await completeThemePrompt();
    if (onboarding) {
      await Promise.all([
        save("onboarding_done", true),
        save("onboarding_started", false),
      ]);
    }
    if (tauriPermissions) await save("tauri_permissions_done", true);
    setComplete(true);
  }, [
    completeThemePrompt,
    onboarding,
    save,
    tauriPermissions,
    themePromptCompleted,
  ]);

  if (!ready) return null;
  if (loading) return <>{children}</>;

  const steps: OnboardingStep[] = [];
  if (legalRequired) {
    steps.push({
      id: "legal",
      title: legalChanged ? "Legal terms changed" : "Privacy Policy & ToS",
      description: "Review and accept the account terms",
      defaultCanContinue: false,
      content: (
        <LegalPage
          changed={legalChanged}
          error={legalError}
          onRetry={retryLegal}
          onAccept={acceptLegal}
        />
      ),
    });
  }
  if (!themePromptCompleted && !themeSkipped) {
    steps.push(
      ...onboardingSteps(onboardingThemeId, setOnboardingThemeId, async () => {
        await completeThemePrompt();
        setThemeSkipped(true);
      }),
    );
  }
  if (tauriPermissions) {
    steps.push({
      id: "tauri-permissions",
      title: "Enable notifications",
      description:
        "We need these permissions so that notifications can be independent of Google Play Services.",
      defaultCanContinue: false,
      content: <TauriPermissionsPage />,
    });
  }

  if (complete || steps.length === 0) return <>{children}</>;
  return (
    <OnboardingFlow
      key={steps.map((step) => step.id).join(":")}
      steps={steps}
      onFinish={finish}
    />
  );
}
