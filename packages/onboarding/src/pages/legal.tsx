import { useCallback, useState } from "react";
import { Button, Checkbox, Label, useOnboardingStep } from "@methanium/ui";

export default function LegalPage({
  changed,
  error,
  onRetry,
  onAccept,
}: {
  changed: boolean;
  error: string;
  onRetry: () => Promise<void>;
  onAccept: () => Promise<void>;
}) {
  const [acceptedPrivacyPolicy, setAcceptedPrivacyPolicy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const canContinue =
    acceptedPrivacyPolicy && acceptedTerms && !error && !saving;

  const accept = useCallback(async () => {
    if (!canContinue) return false;
    setSaving(true);
    try {
      await onAccept();
    } finally {
      setSaving(false);
    }
  }, [canContinue, onAccept]);

  useOnboardingStep({ canContinue, onContinue: accept });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-8 p-6 md:min-h-[calc(100dvh-22rem)] md:p-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">
          {changed ? "Our legal terms have changed" : "Before we get started"}
        </h2>
      </div>
      {error ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void onRetry()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={acceptedTerms}
              id="accept-terms-of-service"
              onCheckedChange={setAcceptedTerms}
            />
            <Label htmlFor="accept-terms-of-service" className="gap-0!">
              I have read and accept the{" "}
              <a
                className="underline ml-1"
                href="https://legal.methanium.net/tensamin/terms-of-service/"
                rel="noreferrer"
                target="_blank"
              >
                Terms of Service
              </a>
              .
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={acceptedPrivacyPolicy}
              id="accept-privacy-policy"
              onCheckedChange={setAcceptedPrivacyPolicy}
            />
            <Label htmlFor="accept-privacy-policy" className="gap-0!">
              I have read and agree to the{" "}
              <a
                className="underline ml-1"
                href="https://legal.methanium.net/tensamin/privacy-policy/"
                rel="noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              .
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}
