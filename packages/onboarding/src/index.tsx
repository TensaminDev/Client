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
import { isTauri } from "@tauri-apps/api/core";
import type { z } from "zod";

import LegalPage from "./pages/legal";
import { onboardingSteps } from "./steps";
import TauriPermissionsPage from "./pages/tauriPermissions";

export {
  useOnboardingStep,
  type OnboardingStep,
  type OnboardingStepControls,
} from "@methanium/ui";

interface GateState {
  docs: z.infer<typeof legalDocsSchema>;
  acceptedPP: boolean;
  acceptedTOS: boolean;
  changedPP: boolean;
  changedTOS: boolean;
  includeLegal: boolean;
  includeOnboarding: boolean;
  includeTauriPermissions: boolean;
}

async function fetchLegalDocumentHash(document: string) {
  const response = await fetch(
    `https://legal.methanium.net/tensamin/${document}/raw`,
  );
  if (!response.ok) {
    throw new Error(`Legal document request failed: ${response.status}`);
  }
  if (!response.headers.get("content-type")?.startsWith("text/plain")) {
    throw new Error("Legal document request returned an invalid content type");
  }

  const hash = await crypto.subtle.digest(
    "SHA-256",
    await response.arrayBuffer(),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { load, save } = useStorage();
  const [state, setState] = useState<GateState>();
  const [complete, setComplete] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");
  const [onboardingThemeId, setOnboardingThemeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const loadingTimer = setTimeout(() => {
      if (active) setShowLoading(true);
    }, 200);

    void (async () => {
      try {
        const [
          ppHash,
          tosHash,
          localDocs,
          acceptedPP,
          acceptedTOS,
          onboardingDone,
          onboardingStarted,
          tauriPermissionsDone,
        ] = await Promise.all([
          fetchLegalDocumentHash("privacy-policy"),
          fetchLegalDocumentHash("terms-of-service"),
          load("legal_docs"),
          load("accepted_privacy_policy"),
          load("accepted_terms_of_service"),
          load("onboarding_done"),
          load("onboarding_started"),
          load("tauri_permissions_done"),
        ]);

        if (!active) return;

        const docs = legalDocsSchema.parse({
          pp: { hash: ppHash },
          tos: { hash: tosHash },
        });
        const changedPP = acceptedPP && localDocs.pp.hash !== docs.pp.hash;
        const changedTOS = acceptedTOS && localDocs.tos.hash !== docs.tos.hash;
        const currentAcceptedPP =
          acceptedPP && localDocs.pp.hash === docs.pp.hash;
        const currentAcceptedTOS =
          acceptedTOS && localDocs.tos.hash === docs.tos.hash;
        const existingUser = acceptedPP && acceptedTOS;
        const includeOnboarding =
          !onboardingDone && (!existingUser || onboardingStarted);

        if (!onboardingDone && existingUser && !onboardingStarted) {
          await save("onboarding_done", true);
          if (!active) return;
        } else if (includeOnboarding && !onboardingStarted) {
          await save("onboarding_started", true);
          if (!active) return;
        }

        setState({
          docs,
          acceptedPP: currentAcceptedPP,
          acceptedTOS: currentAcceptedTOS,
          changedPP,
          changedTOS,
          includeLegal: !currentAcceptedPP || !currentAcceptedTOS,
          includeOnboarding,
          includeTauriPermissions:
            isTauri() &&
            /Android/.test(navigator.userAgent) &&
            !tauriPermissionsDone,
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
      await Promise.all([
        save("onboarding_done", true),
        save("onboarding_started", false),
      ]);
    }
    if (state?.includeTauriPermissions) {
      await save("tauri_permissions_done", true);
    }
    setComplete(true);
  }, [save, state?.includeOnboarding, state?.includeTauriPermissions]);

  if (error && errorDescription) {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (!state) {
    if (!showLoading) return null;
    return <LoadingScreen noProgress title="Fetching legal documents..." />;
  }

  const steps: OnboardingStep[] = [];
  if (state.includeLegal) {
    const changedDocuments = [
      state.changedPP && "Privacy Policy",
      state.changedTOS && "Terms of Service",
    ].filter(Boolean);

    steps.push({
      id: "legal",
      title:
        changedDocuments.length > 0
          ? "Legal documents changed"
          : "Privacy Policy & ToS",
      description:
        changedDocuments.length > 0
          ? changedDocuments.join(" & ")
          : "Review and accept our legal documents",
      defaultCanContinue: false,
      content: (
        <LegalPage
          initiallyAcceptedPP={state.acceptedPP}
          initiallyAcceptedTOS={state.acceptedTOS}
          changedPP={state.changedPP}
          changedTOS={state.changedTOS}
          onAccept={acceptLegal}
        />
      ),
    });
  }
  if (state.includeOnboarding) {
    steps.push(...onboardingSteps(onboardingThemeId, setOnboardingThemeId));
  }
  if (state.includeTauriPermissions) {
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
