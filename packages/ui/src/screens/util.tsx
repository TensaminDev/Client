import { cn } from "../lib/utils";
import Controls from "@tensamin/tauri/controls";

export default function CreateScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-background w-screen h-screen flex flex-col justify-center items-center",
        className,
      )}
      data-tauri-drag-region
    >
      <>
        <Controls className="fixed top-0 right-0 m-[7px] mr-[7.6px]! ring-foreground/15" />
        {children}
      </>
    </div>
  );
}

import { Button } from "../cmp/button";
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
} from "../cmp/alert-dialog";
import { useIsMobile } from "../lib/utils";

export function StorageDestoryer() {
  const isMobile = useIsMobile();
  return (
    <div className={cn("fixed p-5 bottom-0", isMobile ? "w-full" : "right-0")}>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className={isMobile ? "w-full" : ""}>
              Clear storage
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to clear storage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will clear all your settings and
              credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={async () => {
                localStorage.clear();
                for (const db of await indexedDB.databases()) {
                  indexedDB.deleteDatabase(db.name!);
                }
                location.reload();
              }}
            >
              Continue
            </AlertDialogAction>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
