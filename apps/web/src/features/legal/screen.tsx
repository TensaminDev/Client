import { useState, useCallback, useEffect } from "react";
import { useStorage } from "@tensamin/storage/context";
import { Button } from "@tensamin/ui/cmp/button";
import { Checkbox } from "@tensamin/ui/cmp/checkbox";
import { z } from "zod";

import ErrorScreen from "@tensamin/ui/screens/error";

import { legalDocsSchema } from "@tensamin/shared/features/legal/schema";
import { log } from "@tensamin/shared/log";
import Link from "@tensamin/ui/link";
import { Label } from "@tensamin/ui/cmp/label";
import { useLocation } from "@tanstack/react-router";

// Prevents the user from using Tensamin without accepting the privacy policy and terms of service.
export default function Screen(props: { children: React.ReactNode }) {
  const { load, save } = useStorage();
  const location = useLocation();

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [remoteDocs, setRemoteDocs] = useState<
    z.infer<typeof legalDocsSchema> | undefined
  >(undefined);
  const [localDocs, setLocalDocs] = useState<
    z.infer<typeof legalDocsSchema> | undefined
  >(undefined);

  const [loading, setLoading] = useState(true);

  const [acceptedPP, acceptPP] = useState(false);
  const [acceptedTOS, acceptTOS] = useState(false);
  const [hasContinued, setHasContinued] = useState(false);

  const [userId, setUserId] = useState<number | undefined>(undefined);

  // Saves
  const handleContinueLegal = useCallback((): void => {
    const currentDocs = remoteDocs;
    if (!currentDocs) {
      return;
    }

    save("accepted_privacy_policy", true);
    save("accepted_terms_of_service", true);
    save("legal_docs", currentDocs);
    setHasContinued(true);
  }, [remoteDocs, save]);

  useEffect(() => {
    let active = true;

    setLoading(true);

    setError("");
    setErrorDescription("");

    void (async () => {
      try {
        const id = await load("user_id");
        if (!active) {
          return;
        }

        setUserId(id);

        if (id === 0) {
          return;
        }

        const current = await fetch("https://legal.tensamin.net/api/current")
          .then((res) => res.json())
          .catch((err) => {
            if (!active) {
              return undefined;
            }

            setError("Failed to load legal documents");
            setErrorDescription(
              "An error occurred while fetching the legal documents from the server. Please try again later.",
            );
            log(0, "Legal", "red", "Failed to fetch legal documents", err);
            return undefined;
          });

        if (!active || current === undefined) {
          return;
        }

        const safeCurrent = legalDocsSchema.safeParse(current);
        if (!safeCurrent.success) {
          setError("Failed to load legal documents");
          setErrorDescription(
            "The legal documents data received from the server is invalid. Please try again later.",
          );
          log(
            0,
            "Legal",
            "red",
            "Invalid legal documents data",
            safeCurrent.error,
          );
          return;
        }

        setRemoteDocs(safeCurrent.data);

        const currentLocalDocs = await load("legal_docs");
        setLocalDocs(currentLocalDocs);

        const [loadedAcceptedPP, loadedAcceptedTOS] = await Promise.all([
          load("accepted_privacy_policy"),
          load("accepted_terms_of_service"),
        ]);

        if (!active) {
          return;
        }

        acceptPP(
          loadedAcceptedPP &&
            !!currentLocalDocs &&
            currentLocalDocs.pp.hash === safeCurrent.data.pp.hash,
        );
        acceptTOS(
          loadedAcceptedTOS &&
            !!currentLocalDocs &&
            currentLocalDocs.tos.hash === safeCurrent.data.tos.hash,
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [load, location.pathname]);

  if (error !== "" && errorDescription !== "") {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (loading || userId === undefined) {
    return null;
  }

  const docsMatch =
    localDocs !== undefined &&
    remoteDocs !== undefined &&
    localDocs.pp.hash === remoteDocs.pp.hash &&
    localDocs.tos.hash === remoteDocs.tos.hash;

  if (
    (acceptedPP && acceptedTOS && (docsMatch || hasContinued)) ||
    userId === 0
  ) {
    return <>{props.children}</>;
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="h-full flex flex-col gap-15 p-10 md:p-40 w-full lg:w-2/3">
        <h1 className="text-3xl md:text-4xl font-bold">
          Privacy Policy & ToS
          <p className="text-muted-foreground text-[20px] font-normal pt-3">
            {remoteDocs?.pp.version} / {remoteDocs?.tos.version}
          </p>
        </h1>
        <div className="w-full h-full flex flex-col items-center justify-center gap-5">
          <div className="justify-start items-start flex flex-col gap-2">
            <BigCheckbox
              checked={acceptedPP}
              onChange={acceptPP}
              label="I agree to the Privacy Policy"
            />
            <BigCheckbox
              checked={acceptedTOS}
              onChange={acceptTOS}
              label="I agree to the Terms of Service"
            />
            <div className="w-full border-t-2" />
            <Link
              label="Privacy Policy"
              link={`https://legal.tensamin.net/pp/${remoteDocs?.pp.version}`}
            />
            <Link
              label="Terms of Service"
              link={`https://legal.tensamin.net/tos/${remoteDocs?.tos.version}`}
            />
          </div>
        </div>
        <ContinueButton
          disabled={!acceptedPP || !acceptedTOS}
          onClick={handleContinueLegal}
        />
      </div>
    </div>
  );
}

// Components
function ContinueButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full flex justify-end">
      <Button
        size="lg"
        className="text-md w-full md:w-auto"
        onClick={onClick}
        disabled={disabled}
      >
        Continue
      </Button>
    </div>
  );
}

export function BigCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        className="size-5.5 rounded-md flex items-center justify-center"
      />
      <Label className="text-lg">{label}</Label>
    </div>
  );
}
