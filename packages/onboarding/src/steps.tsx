import {
  Button,
  ThemeOnboardingPage,
  type OnboardingStep,
} from "@methanium/ui";

export const onboardingSteps = (
  themeId: string | null,
  setThemeId: (id: string) => void,
  onSkip: () => Promise<void>,
): OnboardingStep[] => [
  {
    id: "theme",
    title: "Theming",
    description:
      "We told you it's customisable. You can pick from our signature themes and tweak them or directly apply custom css.",
    defaultCanContinue: false,
    content: (
      <div className="flex flex-col gap-6">
        <ThemeOnboardingPage value={themeId} onValueChange={setThemeId} />
        <Button
          className="self-end"
          variant="ghost"
          onClick={() => void onSkip()}
        >
          Skip
        </Button>
      </div>
    ),
  },
];
