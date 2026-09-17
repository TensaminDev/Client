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
} from "@methanium/ui";
import { useState } from "react";
import { clearDatabaseStore } from "./indexedDb";

export default function ClearStorageButton({
  className,
}: {
  className?: string;
}) {
  const [error, setError] = useState("");

  async function clearStorage() {
    try {
      if (isTauri()) await invoke("mtp_clear_credentials");
      await window.tensaminDesktop?.secureStorage?.clear?.();
      await Promise.all(
        (["storage", "cache", "keys"] as const).map(clearDatabaseStore),
      );
      localStorage.clear();
      location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button className={className} variant="destructive">
              Clear data and log out
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes settings, cached messages, and credentials from this
              device. You will need to log in again. Remote account data remains
              untouched. This is essentially a factory reset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearStorage}>
              Clear data and log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
