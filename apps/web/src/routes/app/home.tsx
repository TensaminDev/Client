import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input, Button,
  useIsMobile
} from "@tensamin/ui";
import z from "zod";
import { toast } from "@tensamin/shared/log";
import { useTTP } from "@tensamin/ttp/context";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useStorage } from "@tensamin/storage/context";

// The page
export default function Page() {
  const { clear } = useStorage();
  const isMobile = useIsMobile();

  return (
    <div className={`px-3 flex gap-2 ${!(isTauri() && isMobile) && "pt-3"}`}>
      <AddConversationButton />
      <Button disabled>Add Community</Button>
      <Button variant="outline" onClick={() => location.reload()}>
        Reload
      </Button>
      <Button
        variant="destructive"
        onClick={() => clear().then(() => location.reload())}
      >
        Logout
      </Button>
    </div>
  );
}

// Add Conversation Button Component
function AddConversationButton() {
  const { send } = useTTP();
  const [loading, setLoading] = useState(false);

  function submit(username: string | null) {
    if (loading) return;

    const schema = z
      .string()
      .min(1, "Username is too short")
      .max(15, "Username is too long");

    const result = schema.safeParse(username?.toLowerCase().trim());

    if (!result.success) {
      toast("error", result.error.issues[0].message);
      return;
    }

    const timeout = setTimeout(() => setLoading(true), 500);

    send("add_conversation", {
      chat_partner_name: result.data,
    })
      .then(() => {
        toast("success", "Conversation added");
      })
      .catch((error) => {
        if (String(error).includes("error_not_found")) {
          toast("error", "User not found");
          return;
        }

        toast("error", "Failed to add conversation, check console for details");
        console.error("Failed to add conversation", error);
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
  }

  return (
    <Dialog>
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
          <div className="flex w-full justify-end gap-1">
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
