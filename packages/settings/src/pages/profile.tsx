import { Input as MDInput } from "@methanium/ui/markdown";
import { useMTP } from "@tensamin/mtp";
import { mtp } from "@tensamin/shared/data";
import { useStorage } from "@tensamin/storage/context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  Input,
  useIsMobile,
} from "@methanium/ui";
import {
  useUser,
  useUserFields,
  type SelectedUser,
} from "@tensamin/identity/context";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PROFILE_FIELDS = [
  "Avatar",
  "Display",
  "Username",
  "About",
  "UserId",
] as const;
type ProfileDraft = Partial<
  Omit<SelectedUser<typeof PROFILE_FIELDS>, "UserId">
>;

async function prepImage(
  file: File,
  size = 300,
  quality = 0.8,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas context");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  try {
    context.drawImage(
      bitmap,
      (size - width) / 2,
      (size - height) / 2,
      width,
      height,
    );
  } finally {
    bitmap.close();
  }
  return canvas.toDataURL("image/webp", quality);
}

export default function Page() {
  const { updateProfile } = useUser();
  const { load } = useStorage();
  const { send } = useMTP();
  const isMobile = useIsMobile();
  const [userId, setUserId] = useState<number | null>(null);
  const { data: currentUser } = useUserFields(userId, PROFILE_FIELDS);
  const [draftUser, setDraftUser] = useState<ProfileDraft>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const draftInitializedRef = useRef(false);
  const effectiveAvatar =
    draftUser.Avatar === "none" ? undefined : draftUser.Avatar;
  const updateDraftUser = (
    updater: (previous: ProfileDraft) => ProfileDraft,
  ) => {
    setSaveSucceeded(false);
    setErrorMessage("");
    setDraftUser(updater);
  };
  useEffect(() => {
    void load("user_id").then(setUserId);
  }, [load]);
  useEffect(() => {
    if (!currentUser || draftInitializedRef.current) return;
    setDraftUser({
      Avatar: currentUser.Avatar,
      Display: currentUser.Display,
      Username: currentUser.Username,
      About: currentUser.About,
    });
    draftInitializedRef.current = true;
  }, [currentUser]);
  async function handleAvatarUpload(file: File) {
    const avatar = await prepImage(file);
    updateDraftUser((previous) => ({ ...previous, Avatar: avatar }));
    if (avatarUploadRef.current) avatarUploadRef.current.value = "";
  }
  if (!currentUser) return <p>Loading...</p>;
  return (
    <>
      <input
        ref={avatarUploadRef}
        hidden
        onChange={(event) =>
          event.target.files?.[0] && handleAvatarUpload(event.target.files[0])
        }
        type="file"
      />
      <div className={cn("flex flex-col gap-5", isMobile ? "w-full" : "w-80")}>
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarImage src={effectiveAvatar} />
            <AvatarFallback className="text-2xl">
              {draftUser.Display?.slice(0, 2).toUpperCase() ||
                currentUser.Display.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <p>Avatar</p>
            <div className="flex gap-1">
              <Button onClick={() => avatarUploadRef.current?.click()}>
                Upload avatar
              </Button>
              <Button
                onClick={() =>
                  updateDraftUser((previous) => ({
                    ...previous,
                    Avatar: undefined,
                  }))
                }
                variant="destructive"
                disabled={effectiveAvatar === undefined}
              >
                Remove
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              GIFs are supported in decentralised mode or with Tensamin Premium.
              <br />
              Maximum file size is 16mb.
            </p>
          </div>
        </div>
        <Input
          className="w-full"
          onChange={(event) =>
            updateDraftUser((previous) => ({
              ...previous,
              Display: event.target.value,
            }))
          }
          placeholder="Display Name"
          value={draftUser.Display || ""}
        />
        <Input
          className="w-full"
          onChange={(event) =>
            updateDraftUser((previous) => ({
              ...previous,
              Username: event.target.value,
            }))
          }
          placeholder="Username"
          value={draftUser.Username || ""}
        />
        <MDInput
          className="bg-card p-1.5 px-2.5 rounded-lg border"
          paddingY="4px"
          paddingX="10px"
          fontSize=".9rem"
          placeholder="About Me"
          setValue={(value) =>
            updateDraftUser((previous) => ({ ...previous, About: value }))
          }
          value={draftUser.About || ""}
        />
        <Button
          onClick={async () => {
            const { Avatar, ...draftUsersWithoutAvatar } = draftUser;
            const payload = {
              ...draftUsersWithoutAvatar,
              ...(typeof Avatar === "string"
                ? {
                    Avatar: Avatar.startsWith("data:")
                      ? (Avatar.split(",", 2)[1] ?? "")
                      : Avatar,
                  }
                : {}),
            };
            const validation = mtp.ChangeUserData.request.safeParse(payload);
            if (!validation.success) {
              setSaveSucceeded(false);
              setErrorMessage(
                validation.error.issues[0]?.message ?? "Invalid profile data",
              );
              return;
            }
            try {
              const response = await send("ChangeUserData", validation.data);
              if (response.type.startsWith("Error")) {
                throw new Error(response.type);
              }
              await updateProfile(currentUser.UserId, validation.data);
              setSaveSucceeded(true);
              setErrorMessage("");
            } catch (error) {
              setSaveSucceeded(false);
              setErrorMessage("Failed to update profile: " + error);
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
  );
}
