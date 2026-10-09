import { existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const _dirname = dirname(fileURLToPath(import.meta.url));

const rootDir = join(_dirname, "..", "..");
const targetDirs = [join(rootDir, "packages"), join(rootDir, "apps")];

function getPackageDirs(dir: string): string[] {
  const entries = readdirSync(dir);
  const dirs: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;

    if (existsSync(join(fullPath, "package.json"))) {
      dirs.push(fullPath);
      continue;
    }

    dirs.push(...getPackageDirs(fullPath));
  }

  return dirs;
}

for (const targetDir of targetDirs) {
  const packageDirs = getPackageDirs(targetDir);

  for (const fullPath of packageDirs) {
    const entry = relative(rootDir, fullPath);
    console.log(`Linting ${entry}...`);
    try {
      execSync("pnpm run lint", { cwd: fullPath, stdio: "inherit" });
      console.log(`${entry} linted successfully.`);
    } catch {
      console.error(`Failed to lint ${entry}.`);
      process.exit(1);
    }
  }
}

console.log("Done!");
