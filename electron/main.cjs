const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

app.setAppUserModelId("com.centelos.app");

let tray = null;
let softphoneWin = null;
let chatWin = null;
let settingsWin = null;
let unreadCount = 0;
let isInCall = false;

const isDev = !app.isPackaged;
const SOFTPHONE_WIDTH = 300;
const SOFTPHONE_HEIGHT = 500;
const CHAT_WIDTH = 900;
const CHAT_HEIGHT = 650;

function loadRoute(win, route) {
  if (isDev) {
    win.loadURL(`http://localhost:8080/#${route}`);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"), { hash: route });
  }
}

// ─── Helper: send IPC to a specific window if it exists ───
function sendToWindow(win, channel, ...args) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function sendToAllWindows(channel, ...args) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  });
}

function createSoftphoneWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: screenW } = display.workAreaSize;

  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  softphoneWin = new BrowserWindow({
    width: SOFTPHONE_WIDTH, height: SOFTPHONE_HEIGHT,
    x: screenW - SOFTPHONE_WIDTH - 16, y: 16,
    frame: false, resizable: false, skipTaskbar: false, alwaysOnTop: true,
    show: false, transparent: false,
    icon: iconPath,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });

  loadRoute(softphoneWin, "/softphone");
  softphoneWin.on("blur", () => {
    setTimeout(() => {
      if (softphoneWin && !softphoneWin.isDestroyed() && !softphoneWin.isFocused() && !isInCall) softphoneWin.hide();
    }, 150);
  });
  softphoneWin.on("closed", () => { softphoneWin = null; });
}

function toggleSoftphone() {
  if (!softphoneWin || softphoneWin.isDestroyed()) { createSoftphoneWindow(); softphoneWin.show(); return; }
  if (softphoneWin.isVisible()) softphoneWin.hide();
  else { softphoneWin.show(); softphoneWin.focus(); }
}

function createChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.show(); chatWin.focus(); return; }
  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  chatWin = new BrowserWindow({
    width: CHAT_WIDTH, height: CHAT_HEIGHT,
    x: Math.round((screenW - CHAT_WIDTH) / 2), y: Math.round((screenH - CHAT_HEIGHT) / 2),
    frame: false, resizable: true, minWidth: 600, minHeight: 400, show: false,
    icon: iconPath,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  loadRoute(chatWin, "/chat");
  chatWin.once("ready-to-show", () => chatWin.show());
  chatWin.on("closed", () => { chatWin = null; });
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  const iconPath = path.join(__dirname, "icons", "tray-icon.png");
  settingsWin = new BrowserWindow({
    width: 420, height: 500, frame: false, resizable: false, show: false,
    icon: iconPath,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  loadRoute(settingsWin, "/settings");
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => { settingsWin = null; });
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
  try { trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }); }
  catch { trayIcon = nativeImage.createEmpty(); }
  tray = new Tray(trayIcon);
  tray.setToolTip("Centelos Desktop");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", toggleSoftphone);
}

// ─── IPC Handlers ───

ipcMain.on("window:close", (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) win.hide(); });
ipcMain.on("window:minimize", (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) win.minimize(); });
ipcMain.on("window:hide", (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) win.hide(); });

ipcMain.on("tray:set-badge", (_event, count) => {
  unreadCount = count;
  if (tray) tray.setContextMenu(buildTrayMenu());
});

// ─── Cross-Window Call IPC Relay ───

// Chat window requests a call → relay to softphone window
ipcMain.on("call:make", (_event, number) => {
  // Show softphone first
  if (softphoneWin && !softphoneWin.isDestroyed()) {
    softphoneWin.show();
    softphoneWin.focus();
  } else {
    createSoftphoneWindow();
    softphoneWin.show();
  }
  sendToWindow(softphoneWin, "call:make", number);
});

// Chat window requests hangup → relay to softphone
ipcMain.on("call:hangup", () => {
  sendToWindow(softphoneWin, "call:hangup");
});

// Chat window requests accept → relay to softphone
ipcMain.on("call:accept", () => {
  sendToWindow(softphoneWin, "call:accept");
});

// Chat window requests reject → relay to softphone
ipcMain.on("call:reject", () => {
  sendToWindow(softphoneWin, "call:reject");
});

// Softphone broadcasts call state → relay to all OTHER windows
ipcMain.on("call:state-changed", (event, state) => {
  // Track in-call state to prevent auto-hide
  const activeStatuses = ["in-call", "ringing-in", "ringing-out"];
  isInCall = activeStatuses.includes(state?.callStatus);

  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed() && w.webContents !== event.sender) {
      w.webContents.send("call:state-changed", state);
    }
  });
});

// Focus softphone window (e.g. when call starts from chat)
ipcMain.on("window:focus-softphone", () => {
  if (softphoneWin && !softphoneWin.isDestroyed()) {
    softphoneWin.show();
    softphoneWin.focus();
  } else {
    createSoftphoneWindow();
    softphoneWin.show();
  }
});

// ─── Native Notifications with Actions ───

ipcMain.on("notification:show", (_event, { title, body, type }) => {
  if (type === "call") {
    const notif = new Notification({
      title,
      body,
      actions: [
        { type: "button", text: "Answer" },
        { type: "button", text: "Reject" },
      ],
      urgency: "critical",
    });

    notif.on("action", (_event, actionIndex) => {
      const action = actionIndex === 0 ? "answer" : "reject";
      sendToAllWindows("notification:action", action);
      if (action === "answer") {
        if (softphoneWin && !softphoneWin.isDestroyed()) { softphoneWin.show(); softphoneWin.focus(); }
      }
    });

    notif.on("click", () => {
      if (softphoneWin && !softphoneWin.isDestroyed()) { softphoneWin.show(); softphoneWin.focus(); }
      else { toggleSoftphone(); }
    });

    notif.show();
  } else {
    // Chat notification
    const notif = new Notification({ title, body });
    notif.on("click", () => createChatWindow());
    notif.show();
  }
});

ipcMain.on("theme:set", (_event, theme) => {
  sendToAllWindows("theme:changed", theme);
});

ipcMain.handle("settings:get", () => {
  try {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
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

// ─── App Lifecycle ───

app.whenReady().then(() => {
  createTray();
  createSoftphoneWindow(); // hidden, for VoIP registration
  createChatWindow();      // open chat window on startup
});

app.on("window-all-closed", (e) => { if (e && e.preventDefault) e.preventDefault(); });
app.on("activate", () => { toggleSoftphone(); });
