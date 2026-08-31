import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Button,
  useIsMobile,
} from "@methanium/ui";
import z from "zod";
import { MTPProtocolError } from "mtp";
import { RelayRejectedError, requireRelaySuccess, useMTP } from "@tensamin/mtp";
import { log } from "@tensamin/shared/log";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useSession } from "@tensamin/identity/session";
import { useStorage } from "@tensamin/storage/context";
import { ShieldAlert } from "lucide-react";
import { useUser } from "@tensamin/identity/context";

// The page
export default function Page() {
  const isMobile = useIsMobile();
  const { secureStorage } = useStorage();

  return (
    <div
      className={`px-3 flex flex-col gap-3 ${!(isTauri() && isMobile) && "pt-3"}`}
    >
      <div className="flex gap-2">
        <AddConversationButton />
        <Button disabled>Add Community</Button>
      </div>
      {secureStorage && !secureStorage.secure && (
        <div className="flex max-w-2xl gap-3 rounded-lg border border-(--destructive)/60 bg-(--destructive)/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Secure storage is unavailable</p>
            <p>{secureStorage.reason}</p>
            <p className="text-muted-foreground">
              Your keyring and cached messages will get saved in regular
              storage.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Conversation Button Component
function AddConversationButton() {
  const { send, sendSealedRelay } = useMTP();
  const { contacts, insertContact } = useSession();
  const { load } = useStorage();
  const { getIota } = useUser();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(username: string | null) {
    if (loading) return;
    setError(null);

    // username check
    const schema = z
      .string()
      .regex(/^[a-z0-9]+$/, "Username must use lowercase letters and numbers")
      .max(15, "Username is too long");

    const result = schema.safeParse(username?.toLowerCase().trim());

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    let user;
    try {
      user = await send("GetUserData", { Username: result.data });
    } catch (error) {
      if (error instanceof MTPProtocolError && error.type === "ErrorNotFound") {
        setError("User not found");
      } else if (error instanceof MTPProtocolError) {
        setError(`User lookup failed: ${error.type}`);
      } else {
        setError("User lookup failed: connection error");
      }
      return;
    }
    if (user.type === "ErrorNotFound") {
      setError("User not found");
      return;
    }
    if (user.type !== "GetUserData") {
      setError(`User lookup failed: ${user.type}`);
      return;
    }

    // alrady added check
    if (contacts.some((contact) => contact.UserId === user.data.UserId)) {
      setError("Conversation already exists");
      return;
    }

    // add the conv
    const timeout = setTimeout(() => setLoading(true), 500);

    try {
      const userId = await load("user_id");
      const iota = await getIota(userId);
      const response = await sendSealedRelay(
        "AddConversation",
        { ChatPartnerId: user.data.UserId },
        {
          nextHop: { kind: "iota", id: iota.IotaId },
          finalRecipientId: userId,
          metadataRecipients: [{ value: iota.PublicKey, encoding: "base64" }],
          contentRecipients: [{ value: iota.PublicKey, encoding: "base64" }],
        },
      );
      requireRelaySuccess(response);
      insertContact(user.data.UserId);
      setOpen(false);
    } catch (error) {
      if (error instanceof RelayRejectedError) {
        setError(
          `Could not route the request to your Iota: ${error.responseType}`,
        );
      } else {
        log(1, "mtp", "red", "Add conversation failed", error);
        const detail = error instanceof Error ? error.message : "unknown error";
        setError(`Add conversation failed: ${detail}`);
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setError(null);
        }
        setOpen(value);
      }}
    >
      <DialogTrigger
        render={({ onClick }) => (
          <Button onClick={onClick}>Add Conversation</Button>
        )}
      />
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Add a new conversation. Just enter the username of the person you want
          to add as a conversation.
        </DialogDescription>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const username = form.get("username") as string | null;
            submit(username);
          }}
        >
          <Input
            required
            type="text"
            id="username"
            name="username"
            placeholder="Enter username..."
          />
          <div className="flex w-full justify-end items-center gap-1">
            {error && (
              <p className="text-sm text-destructive w-full">{error}</p>
            )}
            <DialogClose
              render={({ onClick }) => (
                <Button onClick={onClick} variant="outline">
                  Cancel
                </Button>
              )}
            />
            <Button disabled={loading} type="submit">
              {loading && <Loader2 className="animate-spin" />} Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
