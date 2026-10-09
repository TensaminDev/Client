import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Config
const PLACEHOLDER_VERSION = "0.0.0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootPackageJsonPath = path.resolve(__dirname, "../../package.json");
const cargoTomlPath = path.resolve(__dirname, "./src-tauri/Cargo.toml");
const tauriConfigPath = path.resolve(__dirname, "./src-tauri/tauri.conf.json");
const cargoLockPath = path.resolve(__dirname, "./src-tauri/Cargo.lock");

// Args
const isUnrender = process.argv.includes("--unrender");

// Version Source
const packageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));

const packageVersion: string = packageJson.version;

if (!packageVersion && !isUnrender) {
  throw new Error("No version found in package.json");
}

const targetVersion = isUnrender ? PLACEHOLDER_VERSION : packageVersion;

// Helpers
function updateCargoToml(content: string): string {
  const regex = /^version\s*=\s*".*"$/m;

  if (!regex.test(content)) {
    throw new Error("Could not find version field in Cargo.toml");
  }

  return content.replace(regex, `version = "${targetVersion}"`);
}

function updateTauriConfig(content: string): string {
  const regex = /"version"\s*:\s*".*"/;

  if (!regex.test(content)) {
    throw new Error("Could not find version field in tauri.conf.json");
  }

  return content.replace(regex, `"version": "${targetVersion}"`);
}

// Update Cargo.toml
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");

const updatedCargoToml = updateCargoToml(cargoToml);

fs.writeFileSync(cargoTomlPath, updatedCargoToml, "utf8");

// Update tauri.conf.json
const tauriConfig = fs.readFileSync(tauriConfigPath, "utf8");

const updatedTauriConfig = updateTauriConfig(tauriConfig);

fs.writeFileSync(tauriConfigPath, updatedTauriConfig, "utf8");
const cargoLock = fs.readFileSync(cargoLockPath, "utf8");
fs.writeFileSync(
  cargoLockPath,
  cargoLock.replace(
    /(\[\[package\]\]\nname = "tensamin"\nversion = ").*("\n)/,
    `$1${targetVersion}$2`,
  ),
);

// Finished
if (isUnrender) {
  console.log(`Unrendered versions back to ${PLACEHOLDER_VERSION}`);
} else {
  console.log(`Rendered version ${targetVersion}`);
}
