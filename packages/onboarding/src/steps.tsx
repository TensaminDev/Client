import {
  Button,
  ThemeOnboardingPage,
  type OnboardingStep,
} from "@nonanium/ui";

export const onboardingSteps = (
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
        <ThemeOnboardingPage />
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
