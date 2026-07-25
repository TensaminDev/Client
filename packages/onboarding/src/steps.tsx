import type { OnboardingStep } from "@methanium/ui";
import OnboardingPage from "./pages/onboarding";

// Add future onboarding pages here. Completed users skip this entire manifest.
export const onboardingSteps: OnboardingStep[] = [
  {
    id: "onboarding",
    content: <OnboardingPage />,
  },
];
