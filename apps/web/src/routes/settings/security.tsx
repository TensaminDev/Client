import { useStorage } from "@tensamin/storage/context";
import { Button, Input, Label } from "@tensamin/ui";
import { useEffect, useState } from "react";

export default function Page() {
  const { save, load } = useStorage();
  const [draftMtpUrl, setDraftMtpUrl] = useState("");
  const [currentMtpUrl, setCurrentMtpUrl] = useState("");

  const [draftForcedOmikronUrl, setDraftForcedOmikronUrl] = useState("");
  const [currentForcedOmikronUrl, setForcedForcedOmikronUrl] = useState("");
  const [draftForcedOmikronPublicKey, setDraftForcedOmikronPublicKey] =
    useState("");
  const [currentForcedOmikronPublicKey, setForcedForcedOmikronPublicKey] =
    useState("");

  useEffect(() => {
    load("omega_url").then((value) => {
      setDraftMtpUrl(value);
      setCurrentMtpUrl(value);
    });
    load("forced_omikron_url").then((value) => {
      setDraftForcedOmikronUrl(value || "");
      setForcedForcedOmikronUrl(value || "");
    });
    load("forced_omikron_public_key").then((value) => {
      setDraftForcedOmikronPublicKey(value || "");
      setForcedForcedOmikronPublicKey(value || "");
    });
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-destructive">
        It's best not to touch these! They can be exploited to gain access to
        your account!
      </p>
      <div className="flex flex-col gap-2">
        <Label>Omega Url</Label>
        <div className="flex gap-1">
          <Input
            value={draftMtpUrl}
            onChange={(e) => setDraftMtpUrl(e.target.value)}
          />
          <Button
            disabled={currentMtpUrl === draftMtpUrl}
            onClick={() => {
              save("omega_url", draftMtpUrl);
            }}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Forced Omikron</Label>
        <div className="flex gap-1">
          <Input
            placeholder="URL..."
            value={draftForcedOmikronUrl || ""}
            onChange={(e) => setDraftForcedOmikronUrl(e.target.value)}
          />
          <Input
            placeholder="Public Key..."
            value={draftForcedOmikronPublicKey || ""}
            onChange={(e) => setDraftForcedOmikronPublicKey(e.target.value)}
          />
          <Button
            disabled={
              currentForcedOmikronUrl === draftForcedOmikronUrl &&
              currentForcedOmikronPublicKey === draftForcedOmikronPublicKey
            }
            onClick={() => {
              save("forced_omikron_url", draftForcedOmikronUrl);
              save("forced_omikron_public_key", draftForcedOmikronPublicKey);
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
