import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Button,
  CreateScreen,
  LoadingScreen,
  OnboardingFlow,
  type OnboardingStep,
} from "@nonanium/ui";
import { useStorage } from "@tensamin/storage/context";
import type { MTPConnectionStatus } from "@tensamin/mtp";
import { useSettingsProfiles } from "@tensamin/settings/profiles";
import { isTauri } from "@tauri-apps/api/core";

import { onboardingSteps } from "./steps";
import TauriPermissionsPage from "./pages/tauriPermissions";
import { GlobeOff } from "lucide-react";

export {
  useOnboardingStep,
  type OnboardingStep,
  type OnboardingStepControls,
} from "@nonanium/ui";

type OnboardingDecision = {
  onboarding: boolean;
  theme: boolean;
  tauriPermissions: boolean;
};

function createDecision(
  flags: NonNullable<ReturnType<typeof useOnboardingFlags>>,
  themePromptCompleted: boolean,
): OnboardingDecision {
  return {
    ...flags,
    theme: flags.onboarding && !themePromptCompleted,
  };
}

function useOnboardingFlags() {
  const { load } = useStorage();
  const [flags, setFlags] = useState<{
    onboarding: boolean;
    tauriPermissions: boolean;
  } | null>(null);

  useEffect(() => {
    void Promise.all([
      load("onboarding_done"),
      load("tauri_permissions_done"),
    ]).then(([onboardingDone, tauriPermissionsDone]) => {
      setFlags({
        onboarding: !onboardingDone,
        tauriPermissions:
          isTauri() &&
          /Android/.test(navigator.userAgent) &&
          !tauriPermissionsDone,
      });
    });
  }, [load]);

  return flags;
}

function StartupLoader({
  connectionReady,
  connectionDescription,
  sessionEstablished,
  connectionStatus,
  retryConnection,
  settingsLoaded,
  onboardingLoaded,
}: {
  connectionReady: boolean;
  connectionDescription: string;
  sessionEstablished: boolean;
  connectionStatus: MTPConnectionStatus | null;
  retryConnection(): void;
  settingsLoaded: boolean;
  onboardingLoaded: boolean;
}) {
  const completedSteps = [
    connectionReady,
    settingsLoaded,
    onboardingLoaded,
  ].filter(Boolean).length;
  const progress = (completedSteps / 3) * 100;
  const description =
    connectionStatus?.kind === "failed"
      ? connectionStatus.description
      : connectionStatus?.kind === "reconnecting"
        ? `Attempt ${connectionStatus.attempt} of 3`
        : undefined;

  if (connectionStatus?.kind === "failed" && !sessionEstablished) {
    return (
      <CreateScreen className="px-5 text-center flex flex-col gap-10 justify-center items-center">
        <GlobeOff size={80} />
        <div className="flex flex-col gap-3">
          <p className="text-foreground font-semibold text-xl">
            Connection failed
          </p>
          <p className="text-muted-foreground text-md w-80 text-center">
            {connectionStatus.description}
          </p>
        </div>
        <Button className="w-full max-w-xs" onClick={retryConnection}>
          Retry
        </Button>
      </CreateScreen>
    );
  }

  const title = !connectionReady
    ? connectionDescription
    : !settingsLoaded
      ? "Loading settings"
      : !onboardingLoaded
        ? "Checking onboarding"
        : "";
  if (connectionStatus?.kind === "reconnecting") {
    return <LoadingScreen title={title} description={description} noProgress />;
  }

  return (
    <LoadingScreen
      title={title}
      description={description}
      progress={progress}
    />
  );
}

async function completeTheme(
  needed: boolean,
  completeThemePrompt: () => Promise<void>,
) {
  if (needed) await completeThemePrompt();
}

async function saveOnboardingCompletion(
  decision: OnboardingDecision,
  save: ReturnType<typeof useStorage>["save"],
) {
  if (decision.onboarding) await save("onboarding_done", true);
  if (decision.tauriPermissions) await save("tauri_permissions_done", true);
}

function createOnboardingSteps({
  decision,
  themeSkipped,
  setThemeSkipped,
  completeThemePrompt,
  finish,
}: {
  decision: OnboardingDecision;
  themeSkipped: boolean;
  setThemeSkipped(value: boolean): void;
  completeThemePrompt(): Promise<void>;
  finish(themeAlreadyComplete?: boolean): Promise<void>;
}) {
  const steps: OnboardingStep[] = [];
  if (decision.theme && !themeSkipped) {
    steps.push(
      ...onboardingSteps(async () => {
        await completeThemePrompt();
        if (decision.tauriPermissions) setThemeSkipped(true);
        else await finish(true);
      }),
    );
  }
  if (decision.tauriPermissions) {
    steps.push({
      id: "tauri-permissions",
      title: "Enable notifications",
      description:
        "We need these permissions so that notifications can be independent of Google Play Services.",
      defaultCanContinue: false,
      content: <TauriPermissionsPage />,
    });
  }
  return steps;
}

function ActiveOnboarding({
  children,
  decision,
  themePromptCompleted,
  completeThemePrompt,
  onRelease,
}: {
  children: ReactNode;
  decision: OnboardingDecision;
  themePromptCompleted: boolean;
  completeThemePrompt(): Promise<void>;
  onRelease(): void;
}) {
  const { save } = useStorage();
  const [complete, setComplete] = useState(false);
  const [themeSkipped, setThemeSkipped] = useState(false);

  const finish = useCallback(
    async (themeAlreadyComplete = false) => {
      setComplete(true);
      onRelease();
      await completeTheme(
        !themeAlreadyComplete && decision.theme && !themePromptCompleted,
        completeThemePrompt,
      );
      await saveOnboardingCompletion(decision, save);
    },
    [completeThemePrompt, decision, onRelease, save, themePromptCompleted],
  );

  const steps = createOnboardingSteps({
    decision,
    themeSkipped,
    setThemeSkipped,
    completeThemePrompt,
    finish,
  });

  useEffect(() => {
    if (steps.length !== 0 || complete) return;
    if (decision.onboarding) void finish(true);
    else onRelease();
  }, [complete, decision.onboarding, finish, onRelease, steps.length]);

  if (complete || steps.length === 0) {
    return <>{children}</>;
  }
  return (
    <OnboardingFlow
      key={steps.map((step) => step.id).join(":")}
      steps={steps}
      onFinish={() => finish()}
    />
  );
}

export default function OnboardingGate({
  children,
  connectionReady,
  connectionDescription,
  sessionEstablished,
  connectionStatus,
  retryConnection,
}: {
  children: ReactNode;
  connectionReady: boolean;
  connectionDescription: string;
  sessionEstablished: boolean;
  connectionStatus: MTPConnectionStatus | null;
  retryConnection(): void;
}) {
  const { save } = useStorage();
  const {
    loaded: settingsLoaded,
    themePromptCompleted,
    completeThemePrompt,
  } = useSettingsProfiles();
  const flags = useOnboardingFlags();
  const decision =
    flags === null || !connectionReady || !settingsLoaded
      ? null
      : createDecision(flags, themePromptCompleted);
  const [released, setReleased] = useState(false);
  const scheduled = useRef(false);
  const release = useCallback(() => setReleased(true), []);

  useEffect(() => {
    if (!released || themePromptCompleted || scheduled.current) return;
    scheduled.current = true;
    void save("onboarding_done", false);
  }, [released, save, themePromptCompleted]);

  if (!sessionEstablished) {
    return (
      <StartupLoader
        connectionReady={connectionReady}
        connectionDescription={connectionDescription}
        connectionStatus={connectionStatus}
        retryConnection={retryConnection}
        sessionEstablished={sessionEstablished}
        settingsLoaded={settingsLoaded}
        onboardingLoaded={flags !== null}
      />
    );
  }

  if (!decision) {
    return (
      <StartupLoader
        connectionReady={connectionReady}
        connectionDescription={connectionDescription}
        connectionStatus={connectionStatus}
        retryConnection={retryConnection}
        sessionEstablished={sessionEstablished}
        settingsLoaded={settingsLoaded}
        onboardingLoaded={flags !== null}
      />
    );
  }

  return (
    <ActiveOnboarding
      decision={decision}
      themePromptCompleted={themePromptCompleted}
      completeThemePrompt={completeThemePrompt}
      onRelease={release}
    >
      {children}
    </ActiveOnboarding>
  );
}
