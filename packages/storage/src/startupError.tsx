import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  CreateScreen,
} from "@methanium/ui";
import { clearDatabaseStore } from "@tensamin/shared/indexedDb";
import { useState } from "react";

export default function StartupErrorScreen({
  error,
  description,
}: {
  error: string;
  description: string;
}) {
  const [resetError, setResetError] = useState("");

  async function reset() {
    try {
      if (isTauri()) await invoke("mtp_clear_credentials");
      await Promise.all(
        (["storage", "cache", "keys"] as const).map(clearDatabaseStore),
      );
      localStorage.clear();
      location.reload();
    } catch (caught) {
      setResetError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <CreateScreen className="gap-4 px-5 text-center">
      <p className="text-base font-semibold">{error}</p>
      <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      {resetError && <p className="text-sm text-destructive">{resetError}</p>}
      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={() => location.reload()}>Retry</Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive">Clear data and log out</Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes settings, cached messages, and credentials from
                this device. You will need to log in again. Remote account data
                remains untouched. This is essentially a factory reset.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={reset}>
                Clear data and log out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </CreateScreen>
  );
}
