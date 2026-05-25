import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import rootPackage from "../../../package.json" with { type: "json" };

const releaseDir = join(import.meta.dir, "..", "release");
const outDir = join(import.meta.dir, "..", "..", "..", "releases");

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
  if (/win|nsis|portable|\.exe$/i.test(file)) return "windows";
  if (/mac|darwin|\.dmg$/i.test(file)) return "macos";
  return "linux";
}

function archFor(file: string) {
  if (/arm64|aarch64/i.test(file)) return "arm64";
  return "x64";
}

if (!existsSync(releaseDir)) {
  throw new Error(`Missing Electron release directory: ${releaseDir}`);
}

const files = readdirSync(releaseDir)
  .filter((file) => !file.endsWith(".blockmap") && !file.endsWith(".yml"))
  .map((file) => join(releaseDir, file))
  .filter((file) => statSync(file).isFile());

const artifacts = await Promise.all(
  files.map(async (filePath) => ({
    name: basename(filePath),
    platform: platformFor(filePath),
    arch: archFor(filePath),
    url: `__FORGEJO_RELEASE_ASSET_URL__/${encodeURIComponent(basename(filePath))}`,
    sha256: await sha256(filePath),
    size: statSync(filePath).size,
  })),
);

const metadata = {
  version: rootPackage.version,
  tag: rootPackage.version,
  publishedAt: new Date().toISOString(),
  artifacts,
};

writeFileSync(join(outDir, "electron-release-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
writeFileSync(
  join(outDir, "SHA256SUMS"),
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join("\n")}\n`,
);
