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

  // ─── Cross-Window Call IPC ───

  // Chat window → main → softphone: request actions
  requestCall: (number) => ipcRenderer.send("call:make", number),
  requestHangup: () => ipcRenderer.send("call:hangup"),
  requestAcceptCall: () => ipcRenderer.send("call:accept"),
  requestRejectCall: () => ipcRenderer.send("call:reject"),
  focusSoftphone: () => ipcRenderer.send("window:focus-softphone"),

  // Softphone → main → other windows: broadcast state
  broadcastCallState: (state) => ipcRenderer.send("call:state-changed", state),

  // Any window: listen for call state updates from softphone
  onCallStateChanged: (callback) => {
    ipcRenderer.on("call:state-changed", (_event, state) => callback(state));
    return () => ipcRenderer.removeAllListeners("call:state-changed");
  },

  // Softphone: listen for delegated call actions from other windows
  onCallMakeRequest: (callback) => {
    ipcRenderer.on("call:make", (_event, number) => callback(number));
    return () => ipcRenderer.removeAllListeners("call:make");
  },
  onCallHangupRequest: (callback) => {
    ipcRenderer.on("call:hangup", (_event) => callback());
    return () => ipcRenderer.removeAllListeners("call:hangup");
  },
  onCallAcceptRequest: (callback) => {
    ipcRenderer.on("call:accept", (_event) => callback());
    return () => ipcRenderer.removeAllListeners("call:accept");
  },
  onCallRejectRequest: (callback) => {
    ipcRenderer.on("call:reject", (_event) => callback());
    return () => ipcRenderer.removeAllListeners("call:reject");
  },

  // Platform
  platform: 'windows',
  isElectron: true,
});
