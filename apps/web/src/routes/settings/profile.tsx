import { useStorage } from "@tensamin/storage/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Input,
} from "@tensamin/ui";
import { useUser, type User } from "@tensamin/user/context";
import { useEffect, useRef, useState } from "react";
import MDInput from "@tensamin/markdown/input";
import { ttp } from "@tensamin/shared/data";
import { useTTP } from "@tensamin/ttp";
import { Check } from "lucide-react";

async function prepImage(
  file: File,
  size = 300,
  quality = 0.8,
): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  ctx.drawImage(bitmap, x, y, width, height);

  return canvas.toDataURL("image/webp", quality);
}

export default function Page() {
  const { get } = useUser();
  const { load } = useStorage();
  const { send } = useTTP();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [draftUser, setDraftUser] = useState<Partial<User>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const draftInitializedRef = useRef(false);
  const effectiveAvatar =
    draftUser.avatar === "none" ? undefined : draftUser.avatar;

  const updateDraftUser = (
    updater: (previous: Partial<User>) => Partial<User>,
  ) => {
    setSaveSucceeded(false);
    setErrorMessage("");
    setDraftUser(updater);
  };

  useEffect(() => {
    const fetchUser = async () => {
      const user = await get(await load("user_id"));
      setCurrentUser(user);
    };

    fetchUser();
  }, [load, get]);

  useEffect(() => {
    if (!currentUser || draftInitializedRef.current) return;

    setDraftUser(currentUser);
    draftInitializedRef.current = true;
  }, [currentUser]);

  const handleAvatarUpload = async (file: File) => {
    const final = await prepImage(file);
    updateDraftUser((prev) => ({ ...prev, avatar: final }));
    if (avatarUploadRef.current) {
      avatarUploadRef.current.value = "";
    }
  };

  return currentUser ? (
    <>
      <input
        ref={avatarUploadRef}
        hidden
        onChange={(e) =>
          e.target.files?.[0] && handleAvatarUpload(e.target.files[0])
        }
        type="file"
      />
      <div className="flex flex-col gap-5 w-80">
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarImage src={effectiveAvatar} />
            <AvatarFallback className="text-2xl">
              {draftUser.display?.slice(0, 2).toUpperCase() ||
                currentUser.display.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <p>Avatar</p>
            <div className="flex gap-1">
              <Button onClick={() => avatarUploadRef.current?.click()}>
                Upload avatar
              </Button>
              <Button
                onClick={() => {
                  updateDraftUser((prev) => {
                    return { ...prev, avatar: "none" };
                  });
                }}
                variant="destructive"
                disabled={effectiveAvatar === undefined}
              >
                Remove
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              GIFs are supported in decentralised mode or with Tensamin Premium
              <br />
              Maximum file size is 16mb.
            </p>
          </div>
        </div>
        <Input
          className="w-full"
          onChange={(event) =>
            updateDraftUser((prev) => ({
              ...prev,
              display: event.target.value,
            }))
          }
          placeholder="Display Name"
          value={draftUser.display || ""}
        />
        <Input
          className="w-full"
          onChange={(event) =>
            updateDraftUser((prev) => ({
              ...prev,
              username: event.target.value,
            }))
          }
          placeholder="Username"
          value={draftUser.username || ""}
        />
        <MDInput
          styled
          paddingY="4px"
          paddingX="10px"
          fontSize=".875rem"
          placeholder="About Me"
          setValue={(value) =>
            updateDraftUser((prev) => ({ ...prev, about: value }))
          }
          value={draftUser.about || ""}
        />
        <Button
          onClick={async () => {
            const payload = {
              ...draftUser,
              avatar:
                typeof draftUser.avatar === "string" &&
                draftUser.avatar.startsWith("data:")
                  ? (draftUser.avatar.split(",", 2)[1] ?? "")
                  : draftUser.avatar,
            };

            const validation = ttp.change_user_data.request.safeParse(payload);

            if (!validation.success) {
              setSaveSucceeded(false);
              setErrorMessage(
                validation.error.issues[0]?.message ?? "Invalid profile data",
              );
              return;
            }

            try {
              await send("change_user_data", validation.data);
              setSaveSucceeded(true);
              setErrorMessage("");
            } catch (err) {
              setSaveSucceeded(false);
              setErrorMessage("Failed to update profile: " + err);
            }
          }}
        >
          {saveSucceeded ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-4" />
              Saved
            </span>
          ) : (
            "Save"
          )}
        </Button>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </div>
    </>
  ) : (
    <p>Loading...</p>
  );
}
