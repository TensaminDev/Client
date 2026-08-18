import { useCallback, useState } from "react";
import { Checkbox, Label, Link, useOnboardingStep } from "@methanium/ui";

export default function LegalPage({
  initiallyAcceptedPP,
  initiallyAcceptedTOS,
  changedPP,
  changedTOS,
  onAccept,
}: {
  initiallyAcceptedPP: boolean;
  initiallyAcceptedTOS: boolean;
  changedPP: boolean;
  changedTOS: boolean;
  onAccept: () => Promise<void>;
}) {
  const [acceptedPP, setAcceptedPP] = useState(initiallyAcceptedPP);
  const [acceptedTOS, setAcceptedTOS] = useState(initiallyAcceptedTOS);

  const handleContinue = useCallback(async () => {
    if (!acceptedPP || !acceptedTOS) return false;
    await onAccept();
  }, [acceptedPP, acceptedTOS, onAccept]);

  useOnboardingStep({
    canContinue: acceptedPP && acceptedTOS,
    onContinue: handleContinue,
  });

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-17rem)] w-full max-w-5xl flex-col gap-10 p-2 py-20 md:min-h-[calc(100dvh-20.5rem)] md:p-24">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-xl flex-col items-start gap-8">
          {!initiallyAcceptedPP && (
            <LegalDocumentAcceptance
              id="acceptPP"
              name="Privacy Policy"
              link="https://legal.methanium.net/tensamin/privacy-policy/"
              changed={changedPP}
              checked={acceptedPP}
              onChange={setAcceptedPP}
            />
          )}
          {!initiallyAcceptedTOS && (
            <LegalDocumentAcceptance
              id="acceptTOS"
              name="Terms of Service"
              link="https://legal.methanium.net/tensamin/terms-of-service/"
              changed={changedTOS}
              checked={acceptedTOS}
              onChange={setAcceptedTOS}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LegalDocumentAcceptance({
  id,
  name,
  link,
  changed,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  link: string;
  changed: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Link label={`Read the ${name}`} link={link} />
      <BigCheckbox
        id={id}
        checked={checked}
        onChange={onChange}
        label={`I agree to the ${changed ? `updated ${name}` : name}`}
      />
    </div>
  );
}

function BigCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="flex size-5.5 items-center justify-center rounded-md"
      />
      <Label htmlFor={id} className="text-lg">
        {label}
      </Label>
    </div>
  );
}
