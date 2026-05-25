import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, net } from "electron";
import type { ReleaseArtifact, ReleaseMetadata, UpdateCheckResult } from "../shared/ipc.js";

const metadataUrl = process.env.TENSAMIN_UPDATE_METADATA_URL;

function compareSemver(left: string, right: string) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function platformName() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return process.platform;
}

function archName() {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  return process.arch;
}

function requestText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Update request failed with HTTP ${response.statusCode}.`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("error", reject);
    request.end();
  });
}

function requestBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Download failed with HTTP ${response.statusCode}.`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
    request.end();
  });
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

function selectArtifact(metadata: ReleaseMetadata): ReleaseArtifact | undefined {
  const platform = platformName();
  const arch = archName();

  return metadata.artifacts.find(
    (artifact) => artifact.platform === platform && artifact.arch === arch,
  );
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  if (!metadataUrl) {
    return { available: false, currentVersion, latestVersion: currentVersion };
  }

  const metadata = JSON.parse(await requestText(metadataUrl)) as ReleaseMetadata;
  const artifact = selectArtifact(metadata);

  if (!artifact || compareSemver(metadata.version, currentVersion) <= 0) {
    return { available: false, currentVersion, latestVersion: metadata.version };
  }

  return {
    available: true,
    currentVersion,
    latestVersion: metadata.version,
    artifact,
  };
}

export async function downloadVerifiedArtifact(artifact: ReleaseArtifact) {
  const updatesDir = join(app.getPath("userData"), "updates");
  await rm(updatesDir, { recursive: true, force: true });
  await mkdir(updatesDir, { recursive: true });

  const destination = join(updatesDir, basename(artifact.name));
  await writeFile(destination, await requestBuffer(artifact.url), { mode: 0o600 });

  const actualHash = await sha256File(destination);
  if (actualHash !== artifact.sha256) {
    await rm(destination, { force: true });
    throw new Error("Downloaded update failed checksum verification.");
  }

  return destination;
}
