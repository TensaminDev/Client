import { useCallback, useState } from "react";
import { Checkbox, Label, Link } from "@methanium/ui";
import { legalDocsSchema } from "@tensamin/shared/features/legal/schema";
import type { z } from "zod";

import { useOnboardingStep } from "@methanium/ui";

type LegalDocs = z.infer<typeof legalDocsSchema>;

export default function LegalPage({
  docs,
  initiallyAcceptedPP,
  initiallyAcceptedTOS,
  onAccept,
}: {
  docs: LegalDocs;
  initiallyAcceptedPP: boolean;
  initiallyAcceptedTOS: boolean;
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
    <div className="mx-auto flex min-h-[calc(100dvh-17rem)] w-full max-w-5xl flex-col gap-10 p-10 py-20 md:min-h-[calc(100dvh-20.5rem)] md:p-24">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-start gap-2">
          <BigCheckbox
            id="acceptPP"
            checked={acceptedPP}
            onChange={setAcceptedPP}
            label="I agree to the Privacy Policy"
          />
          <BigCheckbox
            id="acceptTOS"
            checked={acceptedTOS}
            onChange={setAcceptedTOS}
            label="I agree to the Terms of Service"
          />
          <div className="w-full border-t-2" />
          <Link
            label="Privacy Policy"
            link={`https://legal.tensamin.net/pp/${docs.pp.version}`}
          />
          <Link
            label="Terms of Service"
            link={`https://legal.tensamin.net/tos/${docs.tos.version}`}
          />
        </div>
      </div>
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
