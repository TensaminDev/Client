import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const tauriDir = resolve(scriptDir, "..");
const clientDir = resolve(tauriDir, "../..");
const tauriIconsDir = join(tauriDir, "src-tauri", "icons");
const electronIconsDir = join(clientDir, "apps", "electron", "build", "icons");

const desktopIcons = ["32x32.png", "64x64.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico", "icon.icns"];

await mkdir(electronIconsDir, { recursive: true });

await Promise.all(
  desktopIcons.map((icon) => copyFile(join(tauriIconsDir, icon), join(electronIconsDir, icon))),
);

console.log(`Synced ${desktopIcons.length} desktop icons to ${electronIconsDir}`);
