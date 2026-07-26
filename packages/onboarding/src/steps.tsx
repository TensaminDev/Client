import { ThemeOnboardingPage, type OnboardingStep } from "@methanium/ui";

export const onboardingSteps = (
  themeId: string | null,
  setThemeId: (id: string) => void,
): OnboardingStep[] => [
  {
    id: "theme",
    title: "Theming",
    description:
      "Pick a main theme and after that ... let's just hope you don't get into decision paralysis",
    defaultCanContinue: false,
    content: <ThemeOnboardingPage value={themeId} onValueChange={setThemeId} />,
  },
];
