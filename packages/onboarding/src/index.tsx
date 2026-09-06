import { useCallback, useEffect, useState, type ReactNode } from "react";
import { OnboardingFlow, type OnboardingStep } from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import {
  SettingsProfileOnboarding,
  useSettingsProfiles,
} from "@tensamin/settings/profiles";
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
    needsSelection,
    activeProfileHasTheme,
    loading,
    legalLoading,
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
    if (onboarding) {
      await Promise.all([
        save("onboarding_done", true),
        save("onboarding_started", false),
      ]);
    }
    if (tauriPermissions) await save("tauri_permissions_done", true);
    setComplete(true);
  }, [onboarding, save, tauriPermissions]);

  useEffect(() => {
    if (
      !ready ||
      loading ||
      needsSelection ||
      !onboarding ||
      !activeProfileHasTheme
    )
      return;
    void save("onboarding_done", true).then(() => setOnboarding(false));
  }, [activeProfileHasTheme, loading, needsSelection, onboarding, ready, save]);

  if (!ready || loading || legalLoading) return null;

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
  if (needsSelection) {
    steps.push({
      id: "settings-profile",
      title: "Settings profile",
      description: "Choose the preferences to load",
      defaultCanContinue: false,
      content: <SettingsProfileOnboarding />,
    });
  }
  if (onboarding && !activeProfileHasTheme) {
    steps.push(...onboardingSteps(onboardingThemeId, setOnboardingThemeId));
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
  return <OnboardingFlow steps={steps} onFinish={finish} />;
}
