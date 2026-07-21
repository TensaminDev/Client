import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

let tray: Tray | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getTrayIconPath(filename: string) {
  if (app.isPackaged) return path.join(process.resourcesPath, "icons", filename);
  return path.resolve(__dirname, "../../build/icons", filename);
}

export function setTrayCallStatus(
  inCall: boolean,
  iconDataUrl?: string,
) {
  if (!tray) return;

  if (inCall && iconDataUrl) {
    const image = nativeImage.createFromDataURL(iconDataUrl);
    if (!image.isEmpty()) {
      tray.setImage(image);
      return;
    }
  }

  tray.setImage(getTrayIconPath("32x32.png"));
}

export function initTray(getMainWindow: () => BrowserWindow | null) {
  tray = new Tray(getTrayIconPath("32x32.png")); // keep reference alive

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Restart",
      type: "normal",
      click: () => {
        app.relaunch();
        app.quit();
      },
    },
    { label: "Quit", type: "normal", click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
      mainWindow.hide();
      return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}
