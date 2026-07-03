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
} from "@tensamin/ui";
import z from "zod";
import { useMTP } from "@tensamin/mtp";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useSession } from "@tensamin/storage/session";

// The page
export default function Page() {
  const isMobile = useIsMobile();

  return (
    <div className={`px-3 flex gap-2 ${!(isTauri() && isMobile) && "pt-3"}`}>
      <AddConversationButton />
      <Button disabled>Add Community</Button>
    </div>
  );
}

// Add Conversation Button Component
function AddConversationButton() {
  const { send } = useMTP();
  const { contacts, insertContact } = useSession();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(username: string | null) {
    if (loading) return;
    setError(null);

    // username check
    const schema = z
      .string()
      .min(1, "Username is too short")
      .max(15, "Username is too long");

    const result = schema.safeParse(username?.toLowerCase().trim());

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    // user existence check
    const user = await send("get_user_data", {
      username: result.data,
    })
      .then((data) => {
        if (data.data.UserId === 0) {
          throw new Error();
        }

        return data;
      })
      .catch(() => {
        setError("User not found");
        return;
      });
    if (!user) return;

    // alrady added check
    if (contacts.some((contact) => contact.UserId === user.data.UserId)) {
      setError("Conversation already exists");
      return;
    }

    // add the conv
    const timeout = setTimeout(() => setLoading(true), 500);

    send("add_conversation", {
      ChatPartnerName: result.data,
    })
      .then(() => {
        insertContact(user.data.UserId);
        setOpen(false);
      })
      .catch((error) => {
        if (String(error).includes("error_not_found")) {
          setError("User not found");
          return;
        }

        setError(String(error));
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
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
      <DialogTrigger render={<Button>Add Conversation</Button>} />
      <DialogContent>
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
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button disabled={loading} type="submit">
              {loading && <Loader2 className="animate-spin" />} Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
