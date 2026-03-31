const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  closeWindow: () => ipcRenderer.send("window:close"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  hideWindow: () => ipcRenderer.send("window:hide"),

  // Tray badge
  setTrayBadge: (count) => ipcRenderer.send("tray:set-badge", count),

  // Notifications
  showNotification: ({ title, body, type }) =>
    ipcRenderer.send("notification:show", { title, body, type }),

  // Theme
  setTheme: (theme) => ipcRenderer.send("theme:set", theme),
  onThemeChanged: (callback) => {
    ipcRenderer.on("theme:changed", (_event, theme) => callback(theme));
    return () => ipcRenderer.removeAllListeners("theme:changed");
  },

  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.send("settings:set", settings),

  // Navigation
  openChat: () => ipcRenderer.send("open:chat"),
  openSoftphone: () => ipcRenderer.send("open:softphone"),

  // Notification actions (Answer/Reject from native notifications)
  onNotificationAction: (callback) => {
    ipcRenderer.on("notification:action", (_event, action) => callback(action));
    return () => ipcRenderer.removeAllListeners("notification:action");
  },

  // Platform
  platform: 'windows',
  isElectron: true,
});
