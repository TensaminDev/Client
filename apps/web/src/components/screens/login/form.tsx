import { Button, cn, useIsMobile } from "@methanium/ui";
import { Input } from "@methanium/ui";
import { Label } from "@methanium/ui";
import { useStorage } from "@tensamin/storage/context";
import { log, toast } from "@tensamin/shared/log";
import { File } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { subscribeTuFileLaunch } from "@tensamin/pwa/runtime";
import {
  parseTuFileContent,
  persistMtpCredentials,
} from "@tensamin/storage/credentials";
import { useNavigate } from "@tanstack/react-router";

const fetchedUser = z.object({
  id: z.uuidv4(),
  type: z.string(),
  data: z.object({
    iota_id: z.number(),
    username: z.string(),
    sub_level: z.number(),
    public_key: z.base64(),
    user_id: z.number(),
    sub_end: z.number(),
  }),
});

const formSchema = z.object({
  username: z.string().min(1).max(255),
  mtp_keyring: z.string().min(1).max(92),
});

export default function Form() {
  const isMobile = useIsMobile();
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { load, save } = useStorage();
  const navigate = useNavigate();
  const loginPendingRef = useRef(false);

  const persistLogin = useCallback(
    async (userId: number, privateKey: string, domain?: string | null) => {
      if (loginPendingRef.current) return false;
      loginPendingRef.current = true;
      try {
        await persistMtpCredentials({
          storage: { load, save },
          userId,
          keyring: privateKey,
          domain,
        });
        await navigate({ to: "/", replace: true });
        return true;
      } finally {
        loginPendingRef.current = false;
      }
    },
    [load, navigate, save],
  );

  // Process dropped files
  const processDroppedFile = useCallback(
    async (file: globalThis.File): Promise<void> => {
      try {
        if (!file.name.endsWith(".tu")) {
          toast("error", "Please upload a .tu file");
          return;
        }

        const raw = await file.text();
        const parsed = parseTuFileContent(raw);

        await persistLogin(parsed.userId, parsed.privateKey, parsed.domain);
      } catch (error) {
        log(0, "login", "red", error);
        toast("error", "Failed to load file");
      }
    },
    [persistLogin],
  );

  useEffect(
    () => subscribeTuFileLaunch(processDroppedFile),
    [processDroppedFile],
  );

  // Handle .tu files
  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.currentTarget.files?.[0];

      if (!file) {
        toast("error", "No file selected");
        return;
      }

      await processDroppedFile(file);
    },
    [processDroppedFile],
  );

  // Drag and drop listener
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounter++;

      if (event.dataTransfer?.items?.length) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounter--;

      if (dragCounter <= 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounter = 0;

      setIsDragging(false);

      const file = event.dataTransfer?.files?.[0];

      if (!file) {
        toast("error", "No file dropped");
        return;
      }

      await processDroppedFile(file);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [processDroppedFile]);

  /**
   * Handles username and private key login submission.
   * @param event Form submit event.
   * @returns Promise that resolves after login processing.
   */
  const handleCredentialsSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const rawData = Object.fromEntries(formData);
      const inputParse = formSchema.safeParse(rawData);

      if (!inputParse.success) {
        toast("error", "Please enter valid data");
        return;
      }

      const inputUsername = inputParse.data.username;
      const actualUsername = inputUsername.includes("@")
        ? inputUsername.split("@")[0]
        : inputUsername;
      const domain = inputUsername.includes("@")
        ? inputUsername.split("@")[1]
        : null;

      try {
        const response = await fetch(
          `https://omega.tensamin.net/api/get/id/${actualUsername}`,
        );
        const rawData = await response.arrayBuffer();

        const bytes = new Uint8Array(rawData);
        const jsonString = new TextDecoder().decode(bytes);
        const data = JSON.parse(jsonString);

        const parse = fetchedUser.shape.data.safeParse(data);

        if (!parse.success) {
          log(0, "login", "red", "Invalid response from server", parse.error);
          toast("error", "Invalid response from server");
          return;
        }

        const user = parse.data;

        await persistLogin(user.user_id, inputParse.data.mtp_keyring, domain);
      } catch (error) {
        log(0, "login", "red", error);
        toast("error", "Failed to fetch user data");
      }
    },
    [persistLogin],
  );

  return (
    <div className="relative flex md:flex-row flex-col gap-15">
      {isMobile ? (
        <Button onClick={() => uploadRef.current?.click()}>
          Select .tu file
        </Button>
      ) : (
        <div
          onClick={() => uploadRef.current?.click()}
          className={cn(
            "flex flex-col gap-3 cursor-pointer w-55 aspect-square",
            "border-3 items-center justify-center rounded-lg",
            "transition-all duration-300 ease-in-out",
            "border-input",
            "bg-input/13 hover:bg-input/30",
            isDragging ? "animate-wiggle" : "",
          )}
        >
          <File
            className={["transition-all duration-300 text-foreground"].join(
              " ",
            )}
            size={27}
          />

          <p
            className={[
              "text-md transition-all duration-300",
              isDragging ? "font-medium" : "",
            ].join(" ")}
          >
            Select .tu file
          </p>
        </div>
      )}
      <input
        accept=".tu"
        onChange={handleFileInputChange}
        type="file"
        ref={uploadRef}
        hidden
      />
      <form
        className="flex flex-col gap-5 aspect-square w-55"
        onSubmit={handleCredentialsSubmit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input required type="text" id="username" name="username" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mtp_keyring">MTP Keyring</Label>
          <Input required type="password" id="mtp_keyring" name="mtp_keyring" />
        </div>
        <Button className="mt-auto" type="submit">
          Login
        </Button>
      </form>
    </div>
  );
}
