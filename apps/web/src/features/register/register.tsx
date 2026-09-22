import { useState } from "react";
import { Button, Checkbox, CreateScreen, Input, Label } from "@methanium/ui";
import { useRegistration } from "./use-registration";

export default function Register() {
  const registration = useRegistration();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacyPolicy, setAcceptedPrivacyPolicy] = useState(false);
  const canRegister =
    registration.initialized && acceptedTerms && acceptedPrivacyPolicy;

  return (
    <CreateScreen className="gap-5">
      <form
        className="flex w-full max-w-md flex-col gap-4"
        onSubmit={registration.submit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="invitation">Invitation token</Label>
          <Input
            id="invitation"
            value={registration.credential}
            onChange={(event) =>
              registration.setCredential(event.currentTarget.value)
            }
            readOnly={registration.credentialReadOnly}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            value={registration.username}
            onChange={(event) =>
              registration.setUsername(event.currentTarget.value)
            }
            autoComplete="username"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Invitation password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="off"
          />
        </div>
        {registration.message && (
          <p className="text-sm text-foreground/75">{registration.message}</p>
        )}
        <div className="flex items-start gap-3">
          <Checkbox
            checked={acceptedTerms}
            id="accept-terms-of-service"
            onCheckedChange={setAcceptedTerms}
          />
          <Label htmlFor="accept-terms-of-service" className="gap-0!">
            I have read and accept the{" "}
            <a
              className="ml-1 underline"
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
              className="ml-1 underline"
              href="https://legal.methanium.net/tensamin/privacy-policy/"
              rel="noreferrer"
              target="_blank"
            >
              Privacy Policy
            </a>
            .
          </Label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!canRegister || registration.busy}>
            {registration.busy
              ? "Registering…"
              : registration.initialized
                ? "Create account"
                : "Initializing…"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!registration.canDownloadKeyring}
            onClick={registration.downloadKeyring}
          >
            Download keyring
          </Button>
        </div>
      </form>
    </CreateScreen>
  );
}
