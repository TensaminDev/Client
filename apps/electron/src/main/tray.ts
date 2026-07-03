import { Tray, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

let tray: Tray | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initTray() {
  const iconPath = path.join(__dirname, "../../build/icons/32x32.png");

  tray = new Tray(iconPath); // keep reference alive

  const contextMenu = Menu.buildFromTemplate([
    { label: "Restart", type: "normal" },
    { label: "Quit", type: "normal" },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", (event) => {
    console.log(event);
  })
}