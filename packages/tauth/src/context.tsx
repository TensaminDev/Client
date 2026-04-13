import { useEffect, useState, type ReactNode } from "react";
import { useCrypto } from "@tensamin/crypto/context";
import { useUser } from "@tensamin/user/context";
import { useStorage } from "@tensamin/storage/context";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tensamin/ui";
import { useLocation } from "@tanstack/react-router";
import { useDeeplinks } from "@tensamin/tauri/deeplinkHandler";
import { useTTP } from "@tensamin/ttp";
import { log, toast } from "@tensamin/shared/log";
import { Loader2 } from "lucide-react";

export default function Wrapper({ children }: { children: ReactNode }) {
  const { getSharedSecret } = useCrypto();
  const { get } = useUser();
  const { load } = useStorage();
  const { send } = useTTP();
  const { decrypt } = useCrypto();
  const { searchStr } = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [identifier, setIdentifier] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);

  const { deeplinks } = useDeeplinks();

  const authorizeApp = async () => {
    if (!identifier || !redirect) return;

    try {
      // Get Data
      const user = await get(await load("user_id"));
      const app = await send("get_app", {
        app_identifier: identifier,
      });
      const sharedSecret = await getSharedSecret(
        await load("private_key"),
        user.public_key,
        app.data.app_public_key,
      );

      // Get Challenge
      const res = await send("authenticate_app", {
        app_identifier: identifier,
      });
      const challenge = res.data.challenge;

      // Solve Challenge
      const solvedChallenge = await decrypt(sharedSecret, challenge);

      // Craft Redirect URL
      const finalUrl = new URL(redirect);
      finalUrl.searchParams.set("challenge", solvedChallenge);

      const session = crypto.randomUUID();
      finalUrl.searchParams.set("session", session);

      // Open Redirect URL
      window.open(finalUrl.toString(), "_blank");
    } catch (err) {
      toast("error", "Failed to authorize app");
      log(1, "tauth", "red", "Failed to authorize app", err);
    } finally {
      setDialogOpen(false);
      setLoading(false);
      setIdentifier(null);
      setRedirect(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const identifier = params.get("identifier");
    const redirect = params.get("redirect");
    if (!identifier || !redirect) return;

    // @eslint-disable-next-line react-hooks/exhaustive-deps
    setIdentifier(identifier);
    setRedirect(redirect);
    setDialogOpen(true);
  }, [searchStr]);

  useEffect(() => {
    deeplinks.forEach((link) => {
      if (link.startsWith("tensamin://authorize_app")) {
        const url = new URL(link);
        const identifier = url.searchParams.get("identifier");
        const redirect = url.searchParams.get("redirect");

        if (identifier && redirect) {
          setIdentifier(identifier);
          setRedirect(redirect);
          setDialogOpen(true);
        }
      }
    });
  }, [deeplinks]);

  return (
    <>
      <Dialog
        open={dialogOpen}
        onOpenChange={(value) => {
          setDialogOpen(value);
          if (!value) {
            setIdentifier(null);
            setRedirect(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allow this app to access your data?</DialogTitle>
            <DialogDescription>
              This app is requesting access to your data. Please review the
              permissions and only grant access if you trust this app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={loading}
              onClick={() => {
                setLoading(true);
                authorizeApp();
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Authorizing...
                </>
              ) : (
                "Allow"
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDialogOpen(false);
                setIdentifier(null);
                setRedirect(null);
              }}
            >
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {children}
    </>
  );
}
