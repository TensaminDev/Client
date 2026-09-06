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
} from "@methanium/ui";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSettingsProfiles } from "./profiles";

export function SettingsProfileMenu() {
  const {
    profiles,
    activeProfile,
    loading,
    syncError,
    remoteChange,
    selectProfile,
    createProfile,
    renameProfile,
    deleteProfile,
    reloadRemote,
    keepLocal,
    retrySave,
    validateName,
  } = useSettingsProfiles();
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);

  function openNameDialog(kind: "create" | "rename") {
    setName(kind === "rename" ? (activeProfile?.name ?? "") : "");
    setDialogError("");
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
        await createProfile(name);
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

  return (
    <>
      <div className="flex gap-2">
        <Button
          aria-label="Create profile"
          className="size-9 p-0"
          variant="outline"
          onClick={() => openNameDialog("create")}
        >
          <Plus className="size-4" />
        </Button>
        <Select
          disabled={loading}
          value={activeProfile?.id ?? ""}
          onValueChange={(id) => id && void selectProfile(id)}
        >
          <SelectTrigger className="min-w-50 flex-1 md:max-w-20">
            <SelectValue>{activeProfile?.name ?? "Local settings"}</SelectValue>
          </SelectTrigger>
          <SelectContent className="p-1">
            {profiles.map((profile) => (
              <SelectItem
                disabled={!profile.available}
                key={profile.id}
                value={profile.id}
              >
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label="Rename profile"
          className="size-9 p-0"
          disabled={!activeProfile?.available}
          variant="outline"
          onClick={() => openNameDialog("rename")}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          aria-label="Delete profile"
          className="size-9 p-0"
          disabled={!activeProfile}
          variant="outline"
          onClick={() => {
            setDialogError("");
            setDialog("delete");
          }}
        >
          <Trash2 className="size-4" />
        </Button>
        {syncError && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>Local changes are not synced. {syncError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retrySave()}
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void reloadRemote()}
            >
              Reload remote
            </Button>
          </div>
        )}
        {remoteChange && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <span>
              This profile was{" "}
              {remoteChange === "deleted" ? "deleted" : "updated"} elsewhere.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void reloadRemote()}
            >
              <RotateCcw className="size-4" /> Reload
            </Button>
            <Button size="sm" variant="ghost" onClick={keepLocal}>
              Keep local
            </Button>
          </div>
        )}
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
