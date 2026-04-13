import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const { version } = packageJson;
const releasesDir = join("releases");

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

// deb & rpm
const debDir = "apps/tauri/src-tauri/target/release/bundle/deb";
const rpmDir = "apps/tauri/src-tauri/target/release/bundle/rpm";

const moveBundleArtifact = (
  sourceDir: string,
  extension: ".deb" | ".rpm",
  destinationFileName: string,
) => {
  if (!existsSync(sourceDir)) {
    console.warn(`Skipping ${extension}: ${sourceDir} does not exist.`);
    return;
  }

  const candidates = readdirSync(sourceDir)
    .filter((file) => file.endsWith(extension))
    .map((file) => {
      const filePath = join(sourceDir, file);

      return {
        file,
        filePath,
        matchesVersion: file.includes(version),
        modifiedAt: statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => {
      if (a.matchesVersion !== b.matchesVersion) {
        return Number(b.matchesVersion) - Number(a.matchesVersion);
      }

      return b.modifiedAt - a.modifiedAt;
    });

  const selected = candidates[0];
  if (!selected) {
    console.warn(`Skipping ${extension}: no files found in ${sourceDir}.`);
    return;
  }

  if (!selected.matchesVersion) {
    console.warn(
      `Using ${selected.file} for ${extension} even though it does not include version ${version}.`,
    );
  }

  renameSync(selected.filePath, join(releasesDir, destinationFileName));
};

moveBundleArtifact(debDir, ".deb", `Tensamin-${version}.deb`);
moveBundleArtifact(rpmDir, ".rpm", `Tensamin-${version}.rpm`);

console.log("Releases copied successfully.");