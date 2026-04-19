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
import { isTauri } from "@tauri-apps/api/core";
import { decryptText } from "@tensamin/crypto/worker";

export default function Wrapper({ children }: { children: ReactNode }) {
  const { get } = useUser();
  const { load } = useStorage();
  const { send } = useTTP();
  const { getSharedSecret } = useCrypto();
  const { searchStr } = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [identifier, setIdentifier] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [allowChildern, setAllowChildern] = useState(false);

  const { deeplinks } = useDeeplinks();

  const authorizeApp = async () => {
    if (!identifier || !redirect || !challenge) return;

    try {
      // Get Data
      const user = await get(await load("user_id"));
      const {
        data: { content: appPublicKey },
      } = await send("load_txt_record", {
        path: "tauth." + identifier,
      });

      // Get Shared Secret
      const sharedSecret = await getSharedSecret(
        await load("private_key"),
        user.public_key,
        appPublicKey,
      ).catch((err) => {
        log(1, "tauth", "red", "Failed to get shared secret", err, {
          appPublicKey,
        });
        throw new Error("Failed to get shared secret");
      });

      // Solve Challenge
      const solvedChallenge = await decryptText(sharedSecret, challenge).catch(
        (err) => {
          log(1, "tauth", "red", "Failed to solve challenge", err, {
            challenge,
          });
          throw new Error("Failed to solve challenge");
        },
      );

      // Craft Redirect URL
      const finalUrl = new URL(redirect);
      finalUrl.searchParams.set("userId", String(await load("user_id")));
      finalUrl.searchParams.set("challenge", solvedChallenge);
      finalUrl.searchParams.set("originalChallenge", challenge);

      const session = Date.now();
      finalUrl.searchParams.set("sessionId", String(session));

      // Save Session
      await send("create_app", {
        app_public_key: appPublicKey,
        app_identifier: identifier,
      });

      // Open Redirect URL
      if (isTauri()) {
        window.open(finalUrl.toString(), "_blank");
        setLoading(false);
        setDialogOpen(false);
        setIdentifier(null);
        setRedirect(null);
        setChallenge(null);

        toast("success", "App authorized successfully");
        return;
      } else {
        window.location.href = finalUrl.toString();
        return;
      }
    } catch (err) {
      toast("error", "Failed to authorize app");
      log(1, "tauth", "red", "Failed to authorize app", err);

      setLoading(false);
      setDialogOpen(false);
      setIdentifier(null);
      setRedirect(null);
      setChallenge(null);
    }
  };

  function hexToBase64(hex: string): string {
    const bytes = hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
    const binaryString = String.fromCharCode(...bytes);
    return btoa(binaryString);
  }

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const identifier = params.get("identifier");
    const redirect = params.get("redirect");
    const challenge = params.get("challenge");
    if (!identifier || !redirect) {
      // eslint-disable-next-line
      setAllowChildern(true);
      return;
    }

    load("user_id").then((userId) => {
      if (!challenge) {
        const newUrl = new URL(redirect);
        newUrl.searchParams.set("userId", String(userId));
        window.location.href = newUrl.toString();
        return;
      }

      setAllowChildern(true);
      setIdentifier(identifier);
      setRedirect(redirect);
      setChallenge(hexToBase64(challenge || ""));
      setDialogOpen(true);
    });
  }, [searchStr, load]);

  useEffect(() => {
    deeplinks.forEach((link) => {
      if (link.startsWith("tensamin://authorize_app")) {
        const url = new URL(link);
        const identifier = url.searchParams.get("identifier");
        const redirect = url.searchParams.get("redirect");

        if (identifier && redirect) {
          setIdentifier(identifier);
          setRedirect(redirect);
          setChallenge(hexToBase64(url.searchParams.get("challenge") || ""));
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
            setChallenge(null);
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
                setChallenge(null);
              }}
            >
              Deny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {allowChildern && children}
    </>
  );
}
