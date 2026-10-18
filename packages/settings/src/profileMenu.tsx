import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nonanium/ui";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseTuFileContent } from "@tensamin/storage/credentials";
import { useSettingsProfiles } from "./profiles";

function relativeTime(timestamp: number) {
  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const compact = (value: number, unit: string) =>
    value === 0
      ? "now"
      : value < 0
        ? `${Math.abs(value)}${unit} ago`
        : `in ${value}${unit}`;
  if (Math.abs(seconds) < 60) return compact(seconds, "s");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return compact(minutes, "m");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return compact(hours, "h");
  return compact(Math.round(hours / 24), "d");
}

export function SettingsProfileMenu() {
  const {
    profiles,
    activeProfile,
    loading,
    selectProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    validateName,
  } = useSettingsProfiles();
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountFile, setAccountFile] = useState<File | null>(null);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const accountFileRef = useRef<HTMLInputElement>(null);

  function openNameDialog(kind: "create" | "rename") {
    setName(kind === "rename" ? (activeProfile?.name ?? "") : "");
    setDialogError("");
    setAccountFile(null);
    setDialog(kind);
  }

  async function submitName() {
    const error = validateName(
      name,
      dialog === "rename" ? activeProfile?.id : undefined,
    );
    if (error) {
      setDialogError(error);
      return;
    }
    setSaving(true);
    try {
      if (dialog === "rename" && activeProfile) {
        await renameProfile(activeProfile.id, name);
      } else {
        const account = accountFile
          ? parseTuFileContent(await accountFile.text())
          : undefined;
        await createProfile(name, undefined, account);
      }
      setDialog(null);
    } catch (caught) {
      setDialogError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!activeProfile) return;
    setSaving(true);
    try {
      await deleteProfile(activeProfile.id);
      setDialog(null);
    } catch (caught) {
      setDialogError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function openFilePicker() {
    setFilePickerOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => accountFileRef.current?.click()),
    );
  }

  useEffect(() => {
    const input = accountFileRef.current;
    const closeFilePicker = () => setFilePickerOpen(false);
    input?.addEventListener("cancel", closeFilePicker);
    return () => input?.removeEventListener("cancel", closeFilePicker);
  }, [dialog]);

  return (
    <>
      <div className="flex gap-2 w-full">
        <Button variant="ghost" onClick={() => openNameDialog("create")}>
          <Plus className="size-4" />
        </Button>
        <Select
          disabled={loading}
          value={activeProfile?.id ?? ""}
          onValueChange={(id) => id && void selectProfile(id)}
        >
          <SelectTrigger className="w-full md:max-w-43">
            <SelectValue>{activeProfile?.name ?? "Local settings"}</SelectValue>
          </SelectTrigger>
          <SelectContent className="w-max min-w-(--anchor-width) p-1">
            {[...profiles]
              .sort(
                (left, right) =>
                  (right.document?.lastUsedAt ?? 0) -
                  (left.document?.lastUsedAt ?? 0),
              )
              .map((profile) => (
                <SelectItem
                  disabled={!profile.available}
                  key={profile.id}
                  value={profile.id}
                >
                  <span className="flex min-w-0 items-center gap-6">
                    <span className="max-w-64 truncate">{profile.name}</span>
                    {profile.document && (
                      <span className="text-muted-foreground text-xs">
                        {relativeTime(profile.document.lastUsedAt)}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!activeProfile?.available}
          variant="ghost"
          onClick={() => openNameDialog("rename")}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          className="text-destructive"
          disabled={!activeProfile || profiles.length <= 1}
          variant="ghost"
          onClick={() => {
            setDialogError("");
            setDialog("delete");
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "create"
                ? "Create settings profile"
                : dialog === "rename"
                  ? "Rename settings profile"
                  : "Delete settings profile"}
            </DialogTitle>
            {dialog === "delete" && (
              <DialogDescription>
                The settings profile can't get recovered.
              </DialogDescription>
            )}
          </DialogHeader>
          {dialog !== "delete" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-profile-name">Profile name</Label>
              <Input
                autoFocus
                id="settings-profile-name"
                maxLength={64}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitName();
                }}
              />
              {dialog === "create" && (
                <>
                  <Label htmlFor="settings-profile-account">
                    Add credentials
                  </Label>
                  <Input
                    accept=".tu"
                    className="hidden"
                    id="settings-profile-account"
                    ref={accountFileRef}
                    type="file"
                    onChange={(event) => {
                      setFilePickerOpen(false);
                      setAccountFile(event.currentTarget.files?.[0] ?? null);
                    }}
                  />
                  <Button
                    disabled={filePickerOpen}
                    variant="outline"
                    onClick={openFilePicker}
                  >
                    {filePickerOpen && <Loader2 className="animate-spin" />}
                    {accountFile?.name ?? "Add .tu file"}
                    <p className="text-xs text-muted-foreground">(optional)</p>
                  </Button>
                </>
              )}
            </div>
          )}
          {dialogError && (
            <p className="text-sm text-destructive">{dialogError}</p>
          )}
          <DialogFooter>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={saving}
              variant={dialog === "delete" ? "destructive" : "default"}
              onClick={() =>
                void (dialog === "delete" ? confirmDelete() : submitName())
              }
            >
              {dialog === "delete" ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
