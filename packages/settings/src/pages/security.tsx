import { useStorage } from "@tensamin/storage/context";
import { Button, Input, Label } from "@methanium/ui";
import { useEffect, useState } from "react";

export default function Page() {
  const { save, load } = useStorage();
  const [draftOmegaUrl, setDraftOmegaUrl] = useState("");
  const [currentOmegaUrl, setCurrentOmegaUrl] = useState("");
  const [draftForcedOmikronUrl, setDraftForcedOmikronUrl] = useState("");
  const [currentForcedOmikronUrl, setCurrentForcedOmikronUrl] = useState("");
  const [draftForcedOmikronPublicKey, setDraftForcedOmikronPublicKey] = useState("");
  const [currentForcedOmikronPublicKey, setCurrentForcedOmikronPublicKey] = useState("");

  useEffect(() => {
    load("omega_url").then((value) => { setDraftOmegaUrl(value); setCurrentOmegaUrl(value); });
    load("forced_omikron_url").then((value) => { setDraftForcedOmikronUrl(value || ""); setCurrentForcedOmikronUrl(value || ""); });
    load("forced_omikron_public_key").then((value) => { setDraftForcedOmikronPublicKey(value || ""); setCurrentForcedOmikronPublicKey(value || ""); });
  }, [load]);

  return <div className="flex flex-col gap-8">
    <p className="text-destructive">It's best not to touch these settings! They can be exploited to gain access to your account!</p>
    <div className="flex flex-col gap-2"><Label>Omega Url</Label><div className="flex gap-1"><Input value={draftOmegaUrl} onChange={(event) => setDraftOmegaUrl(event.target.value)} /><Button disabled={currentOmegaUrl === draftOmegaUrl} onClick={() => save("omega_url", draftOmegaUrl).then(() => setCurrentOmegaUrl(draftOmegaUrl))}>Save</Button></div></div>
    <div className="flex flex-col gap-2"><Label>Forced Omikron</Label><div className="flex gap-1"><Input placeholder="URL..." value={draftForcedOmikronUrl} onChange={(event) => setDraftForcedOmikronUrl(event.target.value)} /><Input placeholder="Public Key..." value={draftForcedOmikronPublicKey} onChange={(event) => setDraftForcedOmikronPublicKey(event.target.value)} /><Button disabled={currentForcedOmikronUrl === draftForcedOmikronUrl && currentForcedOmikronPublicKey === draftForcedOmikronPublicKey} onClick={() => { save("forced_omikron_url", draftForcedOmikronUrl).then(() => setCurrentForcedOmikronUrl(draftForcedOmikronUrl)); save("forced_omikron_public_key", draftForcedOmikronPublicKey).then(() => setCurrentForcedOmikronPublicKey(draftForcedOmikronPublicKey)); }}>Save</Button></div></div>
  </div>;
}
