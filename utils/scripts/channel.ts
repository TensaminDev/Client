import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const channel = process.env.TENSAMIN_CHANNEL ?? "stable";
if (!["stable", "canary", "dev"].includes(channel)) {
  throw new Error(`Unknown TENSAMIN_CHANNEL: ${channel}`);
}
export const appId = `net.tensamin.client${channel === "stable" ? "" : `.${channel}`}`;
export const productName = `Tensamin${channel === "stable" ? "" : channel === "canary" ? " Canary" : " Dev"}`;
export const version = JSON.parse(readFileSync(`${root}package.json`, "utf8"))
  .version as string;
const versionCode = process.env.TENSAMIN_ANDROID_VERSION_CODE;
if (
  versionCode &&
  (!/^\d+$/.test(versionCode) ||
    Number(versionCode) < 1 ||
    Number(versionCode) > 2_100_000_000)
) {
  throw new Error(
    "TENSAMIN_ANDROID_VERSION_CODE must be between 1 and 2100000000",
  );
}

// Run any build under the same channel environment, including nested commands.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command)
    throw new Error("Usage: node utils/scripts/channel.ts <command> [args...]");
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      TENSAMIN_CHANNEL: channel,
      TENSAMIN_APP_ID: appId,
      TENSAMIN_PRODUCT_NAME: productName,
      TAURI_CONFIG: JSON.stringify({
        identifier: appId,
        productName,
        version,
        bundle: {
          android: {
            debugApplicationIdSuffix: "",
            ...(versionCode ? { versionCode: Number(versionCode) } : {}),
          },
        },
      }),
    },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
