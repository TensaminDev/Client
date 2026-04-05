import { Button } from "@tensamin/ui/cmp/button";
import { Input } from "@tensamin/ui/cmp/input";
import { Label } from "@tensamin/ui/cmp/label";
import { useStorage } from "@tensamin/storage/context";
import { log, toast } from "@tensamin/shared/log";
import { useNavigate } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import * as React from "react";
import { z } from "zod";

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
  username: z.string().min(1).max(15),
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
} {
  if (rawFileContent.length !== 92 || !rawFileContent.includes("::")) {
    throw new Error("Invalid file");
  }

  const [userIdString, privateKey] = rawFileContent.split("::");
  const userId = Number(userIdString);
  if (!userId || !privateKey) {
    throw new Error("Invalid file");
  }

  return { userId, privateKey };
}

/**
 * Renders the login form for file upload and manual credential login.
 * @returns Login form JSX.
 */
export default function Form() {
  const uploadRef = React.useRef<HTMLInputElement | null>(null);
  const { save } = useStorage();
  const navigate = useNavigate();

  /**
   * Handles uploaded .tu files and stores resolved credentials.
   * @param event Change event from the hidden file input.
   * @returns Promise that resolves when processing has finished.
   */
  const handleFileInputChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      try {
        const file = event.currentTarget.files?.[0];
        if (!file) {
          throw new Error("No file selected");
        }

        const raw = await file.text();
        const parsed = parseTuFileContent(raw);

        await save("user_id", parsed.userId);
        await save("private_key", parsed.privateKey);

        void navigate({ to: "/" });
      } catch (error) {
        log(0, "Login", "red", error);
        toast("error", "Failed to load file");
      }
    },
    [navigate, save],
  );

  /**
   * Handles username and private key login submission.
   * @param event Form submit event.
   * @returns Promise that resolves after login processing.
   */
  const handleCredentialsSubmit = React.useCallback(
    async (event: React.SubmitEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const rawData = Object.fromEntries(formData);
      const inputParse = formSchema.safeParse(rawData);

      if (!inputParse.success) {
        toast("error", "Please enter valid data");
        return;
      }

      try {
        const response = await fetch(
          `https://omega.tensamin.net/api/get/id/${inputParse.data.username}`,
        );
        const rawData = await response.arrayBuffer();

        const bytes = new Uint8Array(rawData);
        const jsonString = new TextDecoder().decode(bytes);
        const data = JSON.parse(jsonString);

        const parse = fetchedUser.shape.data.safeParse(data);

        if (!parse.success) {
          log(0, "Login", "red", "Invalid response from server", parse.error);
          toast("error", "Invalid response from server");
          return;
        }

        const user = parse.data;

        await save("user_id", user.user_id);
        await save("private_key", inputParse.data.private_key);

        navigate({ to: "/" });
      } catch (error) {
        log(0, "Login", "red", error);
        toast("error", "Failed to fetch user data");
      }
    },
    [navigate, save],
  );

  return (
    <div className="flex md:flex-row flex-col gap-15">
      <div
        onClick={() => uploadRef.current?.click()}
        className="flex flex-col gap-3 cursor-pointer w-55 aspect-square bg-input/13 hover:bg-input/30 transition-all duration-300 ease-in-out border-3 items-center justify-center rounded-lg"
      >
        <Upload className="text-foreground" size={27} />
        <p className="text-md">Upload .tu file</p>
      </div>
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
