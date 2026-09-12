import { Button, CreateScreen, Input, Label } from "@methanium/ui";
import { useRegistration } from "./use-registration";

export default function Register() {
  const registration = useRegistration();

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
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={!registration.initialized || registration.busy}
          >
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
