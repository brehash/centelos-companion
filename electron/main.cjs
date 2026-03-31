const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

let tray = null;
let softphoneWin = null;
let chatWin = null;
let settingsWin = null;
let unreadCount = 0;

const isDev = !app.isPackaged;
const SOFTPHONE_WIDTH = 300;
const SOFTPHONE_HEIGHT = 500;
const CHAT_WIDTH = 900;
const CHAT_HEIGHT = 650;

function getBaseUrl() {
  if (isDev) return "http://localhost:8080";
  return `file://${path.join(__dirname, "..", "dist", "index.html")}`;
}

function loadRoute(win, route) {
  if (isDev) {
    win.loadURL(`http://localhost:8080${route}`);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: route,
    });
  }
}

function createSoftphoneWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW } = display.workAreaSize;

  softphoneWin = new BrowserWindow({
    width: SOFTPHONE_WIDTH,
    height: SOFTPHONE_HEIGHT,
    x: screenW - SOFTPHONE_WIDTH - 16,
    y: 16,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRoute(softphoneWin, "/softphone");

  softphoneWin.on("blur", () => {
    setTimeout(() => {
      if (softphoneWin && !softphoneWin.isDestroyed() && !softphoneWin.isFocused()) {
        softphoneWin.hide();
      }
    }, 150);
  });

  softphoneWin.on("closed", () => {
    softphoneWin = null;
  });
}

function toggleSoftphone() {
  if (!softphoneWin || softphoneWin.isDestroyed()) {
    createSoftphoneWindow();
    softphoneWin.show();
    return;
  }
  if (softphoneWin.isVisible()) {
    softphoneWin.hide();
  } else {
    softphoneWin.show();
    softphoneWin.focus();
  }
}

function createChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;

  chatWin = new BrowserWindow({
    width: CHAT_WIDTH,
    height: CHAT_HEIGHT,
    x: Math.round((screenW - CHAT_WIDTH) / 2),
    y: Math.round((screenH - CHAT_HEIGHT) / 2),
    frame: false,
    resizable: true,
    minWidth: 600,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRoute(chatWin, "/chat");
  chatWin.once("ready-to-show", () => chatWin.show());

  chatWin.on("closed", () => {
    chatWin = null;
  });
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 420,
    height: 500,
    frame: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRoute(settingsWin, "/settings");
  settingsWin.once("ready-to-show", () => settingsWin.show());

  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function buildTrayMenu() {
  const chatLabel = unreadCount > 0 ? `Open Chat (${unreadCount})` : "Open Chat";
  return Menu.buildFromTemplate([
    { label: "Open Softphone", click: toggleSoftphone },
    { label: chatLabel, click: createChatWindow },
    { type: "separator" },
    { label: "Settings", click: createSettingsWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Centelos Desktop");
  tray.setContextMenu(buildTrayMenu());

  tray.on("click", toggleSoftphone);
}

ipcMain.on("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on("window:minimize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on("window:hide", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on("tray:set-badge", (_event, count) => {
  unreadCount = count;
  if (tray) tray.setContextMenu(buildTrayMenu());
});

ipcMain.on("notification:show", (_event, { title, body, type }) => {
  const notif = new Notification({ title, body });
  notif.on("click", () => {
    if (type === "chat") {
      createChatWindow();
    } else if (type === "call") {
      toggleSoftphone();
    }
  });
  notif.show();
});

ipcMain.on("theme:set", (_event, theme) => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("theme:changed", theme);
    }
  });
});

ipcMain.handle("settings:get", () => {
  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {}
  return { startInTray: true, theme: "system" };
});

ipcMain.on("settings:set", (_event, settings) => {
  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {}
});

ipcMain.on("open:chat", () => createChatWindow());
ipcMain.on("open:softphone", () => toggleSoftphone());

app.whenReady().then(() => {
  createTray();
  createSoftphoneWindow();

  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!settings.startInTray) {
        softphoneWin.show();
      }
    }
  } catch {}
});

app.on("window-all-closed", (e) => {
  if (e && e.preventDefault) e.preventDefault();
});

app.on("activate", () => {
  toggleSoftphone();
});
