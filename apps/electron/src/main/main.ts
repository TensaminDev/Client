import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } from "electron";
import { checkForUpdates } from "./updates.js";
import { ipcChannels, type DesktopScreenShareCapabilities } from "../shared/ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("--verbose");
let mainWindow: BrowserWindow | null = null;
let selectedScreenShareSourceId: string | null = null;

if (verbose) {
  app.commandLine.appendSwitch("enable-logging", "stderr");
  app.commandLine.appendSwitch("v", "1");
  app.commandLine.appendSwitch("log-level", "0");
}

if (process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland" && !process.env.TENSAMIN_ENABLE_VULKAN) {
  app.commandLine.appendSwitch("disable-features", "Vulkan");
}

function verboseLog(...args: unknown[]) {
  if (verbose) {
    console.log("[tensamin:electron]", ...args);
  }
}

function getRendererIndex() {
  if (!app.isPackaged) {
    return resolve(__dirname, "../../../web/dist/index.html");
  }

  return join(process.resourcesPath, "web", "index.html");
}

function getPlatform(): DesktopScreenShareCapabilities["platform"] {
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "other";
}

function getScreenShareCapabilities(): DesktopScreenShareCapabilities {
  const platform = getPlatform();

  return {
    runtime: "electron",
    platform,
    showAudioOutputSelector: platform === "linux",
    showAudioSwitch: platform === "windows" || platform === "macos",
    hasReliableSystemAudio: platform === "windows",
  };
}

function execJson(command: string, args: string[]) {
  verboseLog("exec", command, args.join(" "));

  return new Promise<unknown>((resolvePromise, reject) => {
    execFile(command, args, { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolvePromise(JSON.parse(stdout));
    });
  });
}

async function listAudioOutputs() {
  verboseLog("listAudioOutputs", { platform: process.platform });

  if (process.platform !== "linux") return [];

  const sinks = await execJson("pactl", ["--format=json", "list", "sinks"]);
  if (!Array.isArray(sinks)) return [];

  return sinks
    .map((sink) => {
      if (!sink || typeof sink !== "object") return null;
      const record = sink as Record<string, unknown>;
      const id = record.index == null ? undefined : String(record.index);
      const name = typeof record.description === "string" ? record.description : id;
      if (!id || !name) return null;
      return { id, name, isDefault: false };
    })
    .filter(Boolean);
}

async function listScreenShareSources() {
  verboseLog("listScreenShareSources");

  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });

  return sources.map((source) => ({
    id: source.id,
    kind: source.id.startsWith("screen:") ? "screen" : "window",
    name: source.name,
    subtitle: source.id,
    thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
  }));
}

function registerDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    verboseLog("display media request", { selectedScreenShareSourceId });

    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
    });

    const selected = sources.find((source) => source.id === selectedScreenShareSourceId);
    selectedScreenShareSourceId = null;
    const video = selected ?? sources[0];

    if (!video) {
      callback({});
      return;
    }

    if (process.platform === "win32") {
      callback({ video, audio: "loopback" });
      return;
    }

    callback({ video });
  });
}

function registerIpc() {
  verboseLog("registering ipc handlers");

  ipcMain.handle(ipcChannels.listScreenShareSources, listScreenShareSources);
  ipcMain.handle(ipcChannels.listScreenShareAudioOutputs, listAudioOutputs);
  ipcMain.handle(ipcChannels.getScreenShareCapabilities, getScreenShareCapabilities);
  ipcMain.handle(ipcChannels.selectScreenShareSource, (_event, sourceId: unknown) => {
    if (typeof sourceId !== "string" || sourceId.length === 0 || sourceId.length > 256) {
      throw new Error("Invalid screen share source id.");
    }

    selectedScreenShareSourceId = sourceId;
    verboseLog("selected screen share source", sourceId);
    return true;
  });
  ipcMain.handle(ipcChannels.getVersion, () => app.getVersion());
  ipcMain.handle(ipcChannels.checkForUpdates, checkForUpdates);
  ipcMain.handle(ipcChannels.minimizeWindow, () => {
    verboseLog("window:minimize");
    mainWindow?.minimize();
  });
  ipcMain.handle(ipcChannels.maximizeWindow, () => {
    verboseLog("window:maximize");
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return;
    }

    mainWindow.maximize();
  });
  ipcMain.handle(ipcChannels.closeWindow, () => {
    verboseLog("window:close");
    mainWindow?.close();
  });
}

async function createWindow() {
  const rendererIndex = getRendererIndex();
  verboseLog("creating main window", {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    rendererIndex,
    argv: process.argv,
  });

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Tensamin",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    verboseLog("blocked window open", url);
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (verbose) {
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const target = level >= 2 ? console.error : console.log;
      target("[tensamin:renderer]", message, { level, line, sourceId });
    });

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error("[tensamin:electron] renderer failed to load", {
        errorCode,
        errorDescription,
        validatedURL,
      });
    });

    mainWindow.webContents.on("did-finish-load", () => {
      verboseLog("renderer finished loading", mainWindow?.webContents.getURL());
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error("[tensamin:electron] renderer process gone", details);
    });

    mainWindow.on("unresponsive", () => {
      console.error("[tensamin:electron] main window became unresponsive");
    });
  }

  await mainWindow.loadFile(rendererIndex);
}

app.on("window-all-closed", () => {
  verboseLog("window-all-closed");
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  verboseLog("activate");
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

if (verbose) {
  process.on("uncaughtException", (error) => {
    console.error("[tensamin:electron] uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[tensamin:electron] unhandled rejection", reason);
  });
}

async function start() {
  verboseLog("waiting for app readiness");
  await app.whenReady();
  verboseLog("app ready");
  registerIpc();
  registerDisplayMediaHandler();
  await createWindow();
}

void start().catch((error) => {
  console.error("[tensamin:electron] failed to start", error);
  app.exit(1);
});
