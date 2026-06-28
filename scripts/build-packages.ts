import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const _dirname = dirname(fileURLToPath(import.meta.url));

const packagesDir = join(_dirname, "..", "packages");

function getPackageDirs(dir: string): string[] {
  const entries = readdirSync(dir);
  const dirs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (!statSync(fullPath).isDirectory()) continue;

    if (existsSync(join(fullPath, "package.json"))) {
      dirs.push(fullPath);
      continue;
    }

    dirs.push(...getPackageDirs(fullPath));
  }

  return dirs;
}

const packageDirs = getPackageDirs(packagesDir);

for (const fullPath of packageDirs) {
  const entry = fullPath.replace(packagesDir + "/", "");
  console.log(`Building ${entry}...`);
  try {
    execSync("bun run build", { cwd: fullPath, stdio: "inherit" });
    console.log(`${entry} built successfully.`);
  } catch {
    console.error(`Failed to build ${entry}.`);
    process.exit(1);
  }
}

console.log("Done!");
