import { base64ToBytes, MTPClient } from "mtp";
import { loadSecureBrowserValue } from "@tensamin/storage/browserSecure";

const result = document.querySelector<HTMLPreElement>("#result");

async function run() {
  const [userId, keyring, omegaUrl] = await Promise.all([
    loadSecureBrowserValue<number>("user_id"),
    loadSecureBrowserValue<string>("mtp_keyring"),
    loadSecureBrowserValue<string>("omega_url"),
  ]);
  if (!userId || !keyring || !omegaUrl) throw new Error("Missing credentials");

  const response = await fetch(`${omegaUrl}api/get/omikron/${userId}`);
  if (!response.ok) throw new Error(`Omikron discovery failed: ${response.status}`);
  const omikron = (await response.json()) as {
    ip_address: string;
    port: number;
    public_key: string;
  };
  const client = await MTPClient.create({
    url: `https://${omikron.ip_address}:${omikron.port}`,
    descriptor: "client",
    credentials: { clientId: userId, keyring: base64ToBytes(keyring) },
    hostPublicKey: { value: omikron.public_key, encoding: "base64" },
    securityProfile: { protectedSignatureSuite: "dual" },
  });

  try {
    await client.auth();
    return "Authenticated";
  } finally {
    client.disconnect();
  }
}

run().then(
  (value) => {
    if (result) result.textContent = value;
  },
  (error: unknown) => {
    if (result) result.textContent = `Failed: ${String(error)}`;
  },
);
