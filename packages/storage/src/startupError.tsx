import { Button, CreateScreen } from "@methanium/ui";
import ClearStorageButton from "@tensamin/shared/clearStorageButton";

export default function StartupErrorScreen({
  error,
  description,
}: {
  error: string;
  description: string;
}) {
  return (
    <CreateScreen className="gap-4 px-5 text-center">
      <p className="text-base font-semibold">{error}</p>
      <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={() => location.reload()}>Retry</Button>
        <ClearStorageButton />
      </div>
    </CreateScreen>
  );
}
