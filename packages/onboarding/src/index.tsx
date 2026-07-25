import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ErrorScreen,
  LoadingScreen,
  OnboardingFlow,
  type OnboardingStep,
} from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import { legalDocsSchema } from "@tensamin/shared/features/legal/schema";
import { log } from "@tensamin/shared/log";
import type { z } from "zod";

import LegalPage from "./pages/legal";
import { onboardingSteps } from "./steps";

export {
  useOnboardingStep,
  type OnboardingStep,
  type OnboardingStepControls,
} from "@methanium/ui";

type LegalDocs = z.infer<typeof legalDocsSchema>;

interface GateState {
  docs: LegalDocs;
  acceptedPP: boolean;
  acceptedTOS: boolean;
  includeLegal: boolean;
  includeOnboarding: boolean;
}

export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { load, save } = useStorage();
  const [state, setState] = useState<GateState>();
  const [complete, setComplete] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  useEffect(() => {
    let active = true;
    const loadingTimer = setTimeout(() => {
      if (active) setShowLoading(true);
    }, 200);

    void (async () => {
      try {
        const response = await fetch("https://legal.tensamin.net/api/current");
        if (!response.ok) {
          throw new Error(`Legal documents request failed: ${response.status}`);
        }

        const current: unknown = await response.json();
        if (!active) return;

        const parsed = legalDocsSchema.safeParse(current);
        if (!parsed.success) {
          setError("Failed to load legal documents");
          setErrorDescription(
            "The legal documents data received from the server is invalid. Please try again later.",
          );
          log(0, "Legal", "red", "Invalid legal documents data", parsed.error);
          return;
        }

        const [localDocs, acceptedPP, acceptedTOS, onboardingDone] =
          await Promise.all([
            load("legal_docs"),
            load("accepted_privacy_policy"),
            load("accepted_terms_of_service"),
            load("onboarding_done"),
          ]);

        if (!active) return;

        const currentAcceptedPP =
          acceptedPP && localDocs.pp.hash === parsed.data.pp.hash;
        const currentAcceptedTOS =
          acceptedTOS && localDocs.tos.hash === parsed.data.tos.hash;
        const existingUser = acceptedPP && acceptedTOS;
        const includeOnboarding = !onboardingDone && !existingUser;

        if (!onboardingDone && existingUser) {
          await save("onboarding_done", true);
          if (!active) return;
        }

        setState({
          docs: parsed.data,
          acceptedPP: currentAcceptedPP,
          acceptedTOS: currentAcceptedTOS,
          includeLegal: !currentAcceptedPP || !currentAcceptedTOS,
          includeOnboarding,
        });
      } catch (caught) {
        if (!active) return;
        setError("Failed to load legal documents");
        setErrorDescription(
          "An error occurred while fetching the legal documents from the server. Please try again later.",
        );
        log(0, "Legal", "red", "Failed to fetch legal documents", caught);
      } finally {
        clearTimeout(loadingTimer);
      }
    })();

    return () => {
      active = false;
      clearTimeout(loadingTimer);
    };
  }, [load, save]);

  const acceptLegal = useCallback(async () => {
    if (!state) return;
    await Promise.all([
      save("accepted_privacy_policy", true),
      save("accepted_terms_of_service", true),
      save("legal_docs", state.docs),
    ]);
    setState((current) =>
      current ? { ...current, acceptedPP: true, acceptedTOS: true } : current,
    );
  }, [save, state]);

  const finish = useCallback(async () => {
    if (state?.includeOnboarding) {
      await save("onboarding_done", true);
    }
    setComplete(true);
  }, [save, state?.includeOnboarding]);

  if (error && errorDescription) {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (!state) {
    if (!showLoading) return null;
    return <LoadingScreen noProgress title="Fetching legal documents..." />;
  }

  const steps: OnboardingStep[] = [];
  if (state.includeLegal) {
    steps.push({
      id: "legal",
      defaultCanContinue: false,
      content: (
        <LegalPage
          docs={state.docs}
          initiallyAcceptedPP={state.acceptedPP}
          initiallyAcceptedTOS={state.acceptedTOS}
          onAccept={acceptLegal}
        />
      ),
    });
  }
  if (state.includeOnboarding) {
    steps.push(...onboardingSteps);
  }

  if (complete || steps.length === 0) return <>{children}</>;

  return <OnboardingFlow steps={steps} onFinish={finish} />;
}
