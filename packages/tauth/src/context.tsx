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
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useDeeplinks } from "@tensamin/tauri/deeplinkHandler";
import { useMTP } from "@tensamin/mtp";
import { log, toast } from "@tensamin/shared/log";
import { Loader2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { decryptText } from "@tensamin/crypto/worker";

export default function Wrapper({ children }: { children: ReactNode }) {
  const { get } = useUser();
  const { load } = useStorage();
  const { send } = useMTP();
  const { getSharedSecret } = useCrypto();
  const { searchStr } = useLocation();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [identifier, setIdentifier] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [appPublicKey, setAppPublicKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [allowChildern, setAllowChildern] = useState(false);

  const { deeplinks } = useDeeplinks();

  const authorizeApp = async () => {
    if (!identifier || !redirect || !challenge || !appPublicKey) return;

    try {
      // Get Data
      const user = await get(await load("user_id"));
      const {
        data: { Content: appPublicKeyHash },
      } = await send("LoadTxtRecord", {
        Path: "tauth." + identifier,
      });

      const verifiedAppPublicKeyHash = await sha256Hex(appPublicKey);
      if (normalizeHash(appPublicKeyHash) !== verifiedAppPublicKeyHash) {
        log(1, "tauth", "red", "App public key hash mismatch", undefined, {
          appPublicKey,
          appPublicKeyHash,
          verifiedAppPublicKeyHash,
        });
        throw new Error("App public key hash mismatch");
      }

      // Get Shared Secret
      const sharedSecret = await getSharedSecret(
        await load("mtp_keyring"),
        user.PublicKey,
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
      finalUrl.searchParams.set(
        "sessionId",
        String(sessionId || new Date().getTime()),
      );

      // Save Session
      await send("CreateApp", {
        AppPublicKey: appPublicKey,
        AppIdentifier: identifier,
      });

      // Open Redirect URL
      if (isTauri()) {
        window.open(finalUrl.toString(), "_blank");
        setLoading(false);
        setDialogOpen(false);
        setIdentifier(null);
        setRedirect(null);
        setChallenge(null);
        setAppPublicKey(null);
        setSessionId(null);

        toast("success", "App authorized successfully");
        return;
      } else {
        navigate({
          href: finalUrl.toString(),
        });
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
      setAppPublicKey(null);
      setSessionId(null);
    }
  };

  async function sha256Hex(value: string): Promise<string> {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalizeHash(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/^sha256[:=]/, "");
  }

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
    const appPublicKey = params.get("public_key");
    const urlSessionId = params.get("sessionId");
    if (!identifier || !redirect) {
      setAllowChildern(true);
      return;
    }

    load("user_id").then((userId) => {
      if (!challenge) {
        const newUrl = new URL(redirect);
        newUrl.searchParams.set("userId", String(userId));
        newUrl.searchParams.set(
          "sessionId",
          String(urlSessionId || new Date().getTime()),
        );
        window.location.href = newUrl.toString();
        return;
      }

      if (!appPublicKey) {
        toast("error", "Missing app public key");
        log(1, "tauth", "red", "Missing app public key");
        setAllowChildern(true);
        return;
      }

      setAllowChildern(true);
      setIdentifier(identifier);
      setRedirect(redirect);
      setChallenge(hexToBase64(challenge || ""));
      setAppPublicKey(appPublicKey);
      setSessionId(urlSessionId);
      setDialogOpen(true);
    });
  }, [searchStr, load]);

  useEffect(() => {
    deeplinks.forEach((link) => {
      if (link.startsWith("tensamin://authorize_app")) {
        const url = new URL(link);
        const identifier = url.searchParams.get("identifier");
        const redirect = url.searchParams.get("redirect");
        const appPublicKey = url.searchParams.get("public_key");
        const urlSessionId = url.searchParams.get("sessionId");

        if (identifier && redirect && appPublicKey) {
          setIdentifier(identifier);
          setRedirect(redirect);
          setChallenge(hexToBase64(url.searchParams.get("challenge") || ""));
          setAppPublicKey(appPublicKey);
          setSessionId(urlSessionId);
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
            setAppPublicKey(null);
            setSessionId(null);
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
                setAppPublicKey(null);
                setSessionId(null);
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
