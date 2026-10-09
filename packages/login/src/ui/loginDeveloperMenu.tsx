import { useEffect, useState } from "react";
import {
  Button,
  buttonVariants,
  Command,
  CommandDialog,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import { normalizeHttpsUrl } from "@tensamin/storage/credentials";

export default function LoginDeveloperMenu() {
  const { load, save } = useStorage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      event.preventDefault();
      if (!event.repeat && !editorOpen) setMenuOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen]);

  const editOmega = async () => {
    setMenuOpen(false);
    setError("");
    try {
      setUrl(await load("omega_url"));
      setEditorOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setEditorOpen(true);
    }
  };

  return (
    <>
      <CommandDialog open={menuOpen} onOpenChange={setMenuOpen}>
        <Command>
          <CommandList>
            <CommandItem
              className={buttonVariants({
                variant: "ghost",
                className: "w-full",
              })}
              onSelect={() => void editOmega()}
            >
              Edit Omega URL
            </CommandItem>
          </CommandList>
        </Command>
      </CommandDialog>
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!busy) setEditorOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Omega URL</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await save(
                  "omega_url",
                  normalizeHttpsUrl(url, "Omega URL").href,
                );
                setEditorOpen(false);
              } catch (caught) {
                setError(
                  caught instanceof Error ? caught.message : String(caught),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              autoFocus
              disabled={busy}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
