import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const devicesResult = spawnSync("adb", ["devices", "-l"], {
  encoding: "utf8",
});

if (devicesResult.status !== 0) {
  process.stderr.write(devicesResult.stderr);
  process.exit(devicesResult.status ?? 1);
}

const devices = devicesResult.stdout
  .split("\n")
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => /\sdevice(?:\s|$)/.test(line));

if (devices.length === 0) {
  console.error("No connected ADB devices found.");
  process.exit(1);
}

let selectedDevice = devices[0];

if (devices.length > 1) {
  console.log("Select a device:");
  devices.forEach((device, index) => console.log(`${index + 1}) ${device}`));

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await readline.question("Device: ");
  readline.close();

  const selectedIndex = Number(answer) - 1;
  if (!Number.isInteger(selectedIndex) || !devices[selectedIndex]) {
    console.error("Invalid device selection.");
    process.exit(1);
  }

  selectedDevice = devices[selectedIndex];
}

const serial = selectedDevice.split(/\s+/, 1)[0];
const uninstallResult = spawnSync(
  "adb",
  ["-s", serial, "uninstall", "net.tensamin.client.dev"],
  { stdio: "inherit" },
);

process.exit(uninstallResult.status ?? 1);
