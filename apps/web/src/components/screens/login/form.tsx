import { Button, cn, useIsMobile } from "@tensamin/ui";
import { Input } from "@tensamin/ui";
import { Label } from "@tensamin/ui";
import { useStorage } from "@tensamin/storage/context";
import { log, toast } from "@tensamin/shared/log";
import { File } from "lucide-react";
import * as React from "react";
import { z } from "zod";
import { isTauri } from "@tauri-apps/api/core";
import QrCodeScanner from "@tensamin/tauri/qrCodeScanner";

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
  private_key: z.string().min(1).max(92),
});

/**
 * Parses a .tu file payload into credentials.
 * @param rawFileContent UTF-8 file content from an uploaded .tu file.
 * @returns Parsed user id and private key credentials.
 */
function parseTuFileContent(rawFileContent: string): {
  userId: number;
  privateKey: string;
  domain: string | null;
} {
  if (rawFileContent.trim().length === 0) {
    throw new Error("File is empty");
  } else if (!rawFileContent.includes("::")) {
    throw new Error("Invalid file");
  } else if (rawFileContent.split("::").length !== 2) {
    throw new Error("Invalid file");
  }

  const left = rawFileContent.split("::")[0];
  const right = rawFileContent.split("::")[1];

  if (left.length === 0) {
    throw new Error("Invalid file");
  } else if (right.length === 0) {
    throw new Error("Invalid file");
  } else if (isNaN(Number(left)) && !left.includes("@")) {
    throw new Error("Invalid file");
  }

  const [userIdString, privateKey] = rawFileContent.split("::");
  const userId = isNaN(Number(userIdString))
    ? Number(userIdString.split("@")[0])
    : Number(userIdString);

  const rawDomain = userIdString.includes("@")
    ? userIdString.split("@")[1]
    : null;
  const domain = rawDomain
    ? rawDomain.includes(":")
      ? rawDomain
      : rawDomain + ":1984"
    : null;

  if (!userId || !privateKey) {
    throw new Error("Invalid file");
  }

  console.log({
    domain,
    rawDomain,
    userId,
  });

  return { userId, privateKey, domain };
}

export default function Form() {
  const isMobile = useIsMobile();
  const uploadRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const { save } = useStorage();

  // Process dropped files
  const processDroppedFile = React.useCallback(
    async (file: globalThis.File): Promise<void> => {
      try {
        if (!file.name.endsWith(".tu")) {
          toast("error", "Please upload a .tu file");
          return;
        }

        const raw = await file.text();
        const parsed = parseTuFileContent(raw);

        await save("session_id", Date.now());
        await save("user_id", parsed.userId);
        await save("private_key", parsed.privateKey);
        if (parsed.domain) {
          await save("mtp_url", `https://${parsed.domain}/`);
        }

        location.href = "/";
      } catch (error) {
        log(0, "login", "red", error);
        toast("error", "Failed to load file");
      }
    },
    [save],
  );

  // Handle .tu files
  const handleFileInputChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
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
  React.useEffect(() => {
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
  const handleCredentialsSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
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
      const rawDomain = inputUsername.includes("@")
        ? inputUsername.split("@")[1]
        : null;
      const domain = rawDomain
        ? rawDomain.includes(":")
          ? rawDomain
          : rawDomain + ":1984"
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

        await save("session_id", Date.now());
        await save("user_id", user.user_id);
        await save("private_key", inputParse.data.private_key);
        if (domain) {
          await save("mtp_url", `https://${domain}/`);
        }

        location.href = "/";
      } catch (error) {
        log(0, "login", "red", error);
        toast("error", "Failed to fetch user data");
      }
    },
    [save],
  );

  return (
    <div className="relative flex md:flex-row flex-col gap-15">
      {isTauri() && isMobile ? (
        <>
          <QrCodeScanner
            onData={async (data) => {
              if (!data.startsWith("tensamin://tu::")) {
                toast("error", "Invalid QR code");
                return;
              }

              const decoded = data.replace("tensamin://tu::", "");

              try {
                const { userId, privateKey, domain } =
                  parseTuFileContent(decoded);

                await save("session_id", Date.now());
                await save("user_id", userId);
                await save("private_key", privateKey);

                if (domain) {
                  await save("mtp_url", `https://${domain}/`);
                }

                location.href = "/";
              } catch (error) {
                log(0, "login", "red", error);
                toast("error", "Failed to parse QR code data");
              }
            }}
          />
          <Button onClick={() => uploadRef.current?.click()}>
            Select .tu file
          </Button>
        </>
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
          <Label htmlFor="private_key">Private Key</Label>
          <Input required type="password" id="private_key" name="private_key" />
        </div>
        <Button className="mt-auto" type="submit">
          Login
        </Button>
      </form>
    </div>
  );
}
