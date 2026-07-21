import { useState, useCallback, useEffect } from "react";
import { useStorage } from "@tensamin/storage/context";
import {
  Button,
  Checkbox,
  CreateScreen,
  ErrorScreen,
  Label,
  Link,
  Spinner,
} from "@tensamin/ui";
import { z } from "zod";

import { legalDocsSchema } from "@tensamin/shared/features/legal/schema";
import { log } from "@tensamin/shared/log";

// Prevents the user from using Tensamin without accepting the privacy policy and terms of service.
export default function Screen(props: { children: React.ReactNode }) {
  const { load, save } = useStorage();

  const [error, setError] = useState("");
  const [errorDescription, setErrorDescription] = useState("");

  const [remoteDocs, setRemoteDocs] = useState<
    z.infer<typeof legalDocsSchema> | undefined
  >(undefined);
  const [localDocs, setLocalDocs] = useState<
    z.infer<typeof legalDocsSchema> | undefined
  >(undefined);

  const [loading, setLoading] = useState(true);
  const [showLoading, setShowLoading] = useState(false);

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
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;

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

        loadingTimer = setTimeout(() => {
          if (active) setShowLoading(true);
        }, 200);

        const response = await fetch("https://legal.tensamin.net/api/current");
        if (!response.ok) {
          throw new Error(`Legal documents request failed: ${response.status}`);
        }
        const current: unknown = await response.json();

        if (!active) {
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
      } catch (err) {
        if (!active) return;

        setError("Failed to load legal documents");
        setErrorDescription(
          "An error occurred while fetching the legal documents from the server. Please try again later.",
        );
        log(0, "Legal", "red", "Failed to fetch legal documents", err);
      } finally {
        clearTimeout(loadingTimer);
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      clearTimeout(loadingTimer);
    };
  }, [load]);

  if (error !== "" && errorDescription !== "") {
    return <ErrorScreen error={error} description={errorDescription} />;
  }

  if (loading || userId === undefined) {
    if (!showLoading) return null;

    return (
      <CreateScreen>
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8" />
          <p className="text-sm text-muted-foreground">
            Fetching legal documents...
          </p>
          <Link
            label="status.methanium.net"
            link="https://status.methanium.net"
          />
        </div>
      </CreateScreen>
    );
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
    <CreateScreen>
      <div className="h-full flex flex-col gap-15 p-10 py-20 md:p-40 w-full lg:w-2/3">
        <h1 className="text-3xl md:text-4xl font-bold">
          Privacy Policy & ToS
          <p className="text-muted-foreground text-[20px] font-normal pt-3">
            {remoteDocs?.pp.version} / {remoteDocs?.tos.version}
          </p>
        </h1>
        <div className="w-full h-full flex flex-col items-center justify-center gap-5">
          <div className="justify-start items-start flex flex-col gap-2">
            <BigCheckbox
              id="acceptPP"
              checked={acceptedPP}
              onChange={acceptPP}
              label="I agree to the Privacy Policy"
            />
            <BigCheckbox
              id="acceptTOS"
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
    </CreateScreen>
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
        className="size-5.5 rounded-md flex items-center justify-center"
      />
      <Label htmlFor={id} className="text-lg">
        {label}
      </Label>
    </div>
  );
}
