import {
  copyFileSync,
  createReadStream,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import packageJson from "../../package.json" with { type: "json" };

const { version } = packageJson;
const releaseVersion = process.env.TENSAMIN_RELEASE_VERSION || version;
const releaseTag = process.env.TENSAMIN_RELEASE_TAG || releaseVersion;
const releasesDir = join("releases");
const releaseAssetBaseUrl = process.env.FORGEJO_RELEASE_ASSET_BASE_URL;

function sha256(filePath: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function platformFor(file: string) {
  if (/\.apk$/i.test(file)) return "android";
  if (/win|nsis|portable|\.exe$/i.test(file)) return "windows";
  if (/mac|darwin|\.dmg$/i.test(file)) return "macos";
  return "linux";
}

function archFor(file: string) {
  if (/arm64|aarch64/i.test(file)) return "arm64";
  if (/\.apk$/i.test(file)) return "universal";
  return "x64";
}

// directory
rmSync(releasesDir, { recursive: true, force: true });
mkdirSync(releasesDir, { recursive: true });

// apk
const apkSrc =
  "apps/tauri/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk";
if (existsSync(apkSrc)) {
  renameSync(apkSrc, join(releasesDir, `Tensamin-${version}.apk`));
} else {
  console.warn(`Skipping .apk: ${apkSrc} does not exist.`);
}

// Electron desktop artifacts
const electronReleaseDir = "apps/electron/release";
const electronArtifactPattern = /\.(AppImage|deb|rpm|exe|dmg|zip)$/i;

function readFilesRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) return readFilesRecursive(filePath);
    if (stat.isFile()) return [filePath];
    return [];
  });
}

const copyElectronArtifacts = () => {
  if (!existsSync(electronReleaseDir)) {
    console.warn(
      `Skipping Electron artifacts: ${electronReleaseDir} does not exist.`,
    );
    return;
  }

  for (const source of readFilesRecursive(electronReleaseDir)) {
    const file = basename(source);
    if (!electronArtifactPattern.test(file)) continue;

    copyFileSync(source, join(releasesDir, file));
  }
};

copyElectronArtifacts();

const artifacts = await Promise.all(
  readdirSync(releasesDir)
    .map((file) => join(releasesDir, file))
    .filter((file) => statSync(file).isFile())
    .filter(
      (file) =>
        !file.endsWith("electron-release-metadata.json") &&
        !file.endsWith("SHA256SUMS"),
    )
    .map(async (filePath) => {
      const name = filePath.split(/[\\/]/).at(-1)!;

      return {
        name,
        platform: platformFor(name),
        arch: archFor(name),
        url: releaseAssetBaseUrl
          ? `${releaseAssetBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}`
          : `__FORGEJO_RELEASE_ASSET_URL__/${encodeURIComponent(name)}`,
        sha256: await sha256(filePath),
        size: statSync(filePath).size,
      };
    }),
);

writeFileSync(
  join(releasesDir, "electron-release-metadata.json"),
  `${JSON.stringify({ version: releaseVersion, tag: releaseTag, publishedAt: new Date().toISOString(), artifacts: artifacts.filter((artifact) => artifact.platform !== "android") }, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(releasesDir, "SHA256SUMS"),
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`,
  "utf8",
);

console.log("Releases copied successfully.");
