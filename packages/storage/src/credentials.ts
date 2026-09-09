import { invoke, isTauri } from "@tauri-apps/api/core";

import type { StorageContextValue } from "./context";

export function parseTuFileContent(rawFileContent: string): {
  userId: number;
  privateKey: string;
  domain: string | null;
} {
  const content = rawFileContent.trim();
  const separator = content.indexOf("::");
  if (separator <= 0 || separator !== content.lastIndexOf("::")) {
    throw new Error("Invalid file");
  }

  const identity = content.slice(0, separator);
  const privateKey = content.slice(separator + 2).trim();
  const [userIdValue, domain, ...extraDomainParts] = identity.split("@");
  const userId = Number(userIdValue);
  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    !privateKey ||
    extraDomainParts.length > 0 ||
    (identity.includes("@") && !domain)
  ) {
    throw new Error("Invalid file");
  }

  return { userId, privateKey, domain: domain ?? null };
}

export async function persistMtpCredentials({
  storage,
  userId,
  keyring,
  domain,
}: {
  storage: Pick<StorageContextValue, "load" | "save">;
  userId: number;
  keyring: string;
  domain?: string | null;
}) {
  const omegaUrl = domain
    ? `https://${domain}/`
    : await storage.load("omega_url");
  if (domain) await storage.save("omega_url", omegaUrl);
  if (isTauri()) {
    const [forcedOmikronUrl, forcedOmikronPublicKey] = await Promise.all([
      storage.load("forced_omikron_url"),
      storage.load("forced_omikron_public_key"),
    ]);
    await invoke("mtp_store_credentials", {
      config: {
        userId,
        keyring,
        omegaUrl,
        forcedOmikronUrl,
        forcedOmikronPublicKey,
      },
    });
  }

  await storage.save("mtp_keyring", keyring, { secure: true });
  await storage.save("session_id", Date.now());
  await storage.save("user_id", userId);
}
