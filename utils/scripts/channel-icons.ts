import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { appId, channel, productName, root } from "./channel.ts";

const tauri = join(root, "apps/tauri");
const output = join(root, ".channel/icons");
mkdirSync(output, { recursive: true });
const stable = readFileSync(join(tauri, "logo.svg"), "utf8");
const yellow: Record<string, string> = {
  "#b8f8ff": "#fff6b8",
  "#031616": "#161303",
  "#043b3c": "#3c3304",
  "#004b4a": "#4b4000",
  "#00524e": "#524600",
  "#006560": "#655600",
  "#02857d": "#857102",
  "#12a89e": "#a88f12",
};
let svg =
  channel === "canary"
    ? stable.replace(
        /#[\da-f]{6}/gi,
        (color) => yellow[color.toLowerCase()] ?? color,
      )
    : stable;
if (channel === "dev") {
  const outline = readFileSync(
    join(root, "utils/icons/logo_outline.svg"),
    "utf8",
  );
  svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-2.3185425 0 89.263405 89.263405">${outline
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(
      'clip-path="url(#outline-shield)" fill="none"',
      'clip-path="url(#outline-shield)" fill="#2563eb"',
    )}</svg>`;
}
writeFileSync(join(output, "logo.svg"), svg);
if (channel === "canary") {
  // Adaptive foregrounds need the same 50% logo area as stable's android.png.
  const foreground = svg.replace(/viewBox="([^"]+)"/, (_, viewBox: string) => {
    const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
    return `viewBox="${x - width / 2} ${y - height / 2} ${width * 2} ${height * 2}"`;
  });
  writeFileSync(join(output, "android.svg"), foreground);
}
// Derive all raster sizes and adaptive Android layers from the channel SVG.
writeFileSync(
  join(output, "background.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="background" x2="0%" y2="100%"><stop stop-color="#837002"/><stop offset="1" stop-color="#ebdf9e"/></linearGradient></defs><rect width="512" height="512" fill="${channel === "dev" ? "none" : channel === "canary" ? "url(#background)" : "#006560"}"/></svg>`,
);
writeFileSync(
  join(output, "logo.json"),
  JSON.stringify(
    channel === "stable"
      ? {
          default: "logo.svg",
          android_fg: join(tauri, "android.png"),
          android_bg: join(tauri, "background.png"),
          android_fg_scale: 100,
          android_monochrome: join(tauri, "monochrome.png"),
        }
      : {
          default: "logo.svg",
          android_fg: channel === "canary" ? "android.svg" : "logo.svg",
          android_bg: "background.svg",
          android_fg_scale: 100,
          android_monochrome:
            channel === "canary"
              ? join(tauri, "monochrome.png")
              : join(root, "utils/icons/logo_outline.svg"),
        },
  ),
);
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "tauri",
    "icon",
    join(output, "logo.json"),
    "--output",
    join(output, "generated"),
  ],
  { cwd: tauri, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const icons = join(output, "generated");
// Tauri emits ICNS entries in hash-map order. Sort them for reproducible output.
const icns = readFileSync(join(icons, "icon.icns"));
const entries: Buffer[] = [];
for (let offset = 8; offset < icns.length;) {
  const size = icns.readUInt32BE(offset + 4);
  entries.push(icns.subarray(offset, offset + size));
  offset += size;
}
entries.sort((a, b) => Buffer.compare(a.subarray(0, 4), b.subarray(0, 4)));
writeFileSync(
  join(icons, "icon.icns"),
  Buffer.concat([icns.subarray(0, 8), ...entries]),
);
const desktop = join(root, "apps/electron/build/icons");
mkdirSync(desktop, { recursive: true });
for (const icon of [
  "32x32.png",
  "64x64.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.png",
  "icon.ico",
  "icon.icns",
]) {
  copyFileSync(join(icons, icon), join(desktop, icon));
}
for (const entry of readdirSync(icons).filter((entry) => entry !== "android")) {
  cpSync(join(icons, entry), join(tauri, "src-tauri/icons", entry), {
    recursive: true,
  });
}
const android = join(icons, "android");
if (existsSync(android))
  cpSync(android, join(tauri, "src-tauri/gen/android/app/src/main/res"), {
    recursive: true,
  });
copyFileSync(
  join(icons, "icon.ico"),
  join(root, "apps/web/public/favicon.ico"),
);
writeFileSync(
  join(desktop, "channel.json"),
  JSON.stringify({ channel, appId, productName }) + "\n",
);
console.log(`Generated ${channel} icons`);
