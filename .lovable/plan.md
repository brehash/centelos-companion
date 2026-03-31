

# Fix Taskbar Icon & Softphone Routing Reliability

## Issue 1: Taskbar shows default Electron icon

**Root cause**: The `tray-icon.png` is a 16x16 tray icon — too small for the taskbar. Windows uses a separate mechanism (`AppUserModelID` + the `icon` from BrowserWindow) for the taskbar icon, and needs a larger icon (256x256 ideally). Also, `app.setAppUserModelId()` is not being called.

**Fix**:
1. Copy the `centelos-icon.png` from the Centelos project assets into `electron/icons/app-icon.png` — this is a proper logo image suitable for taskbar use.
2. In `electron/main.cjs`:
   - Add `app.setAppUserModelId("com.centelos.app")` near the top (before `app.whenReady()`)
   - Use `app-icon.png` as the `icon` for all `BrowserWindow` instances (softphone, chat, settings) — keep `tray-icon.png` only for the tray

## Issue 2: Softphone sometimes loads chat

**Root cause**: The `loadRoute` already uses `/#/softphone`, but there's a race condition. When `toggleSoftphone()` calls `createSoftphoneWindow()` then immediately `softphoneWin.show()`, the window may not have finished loading the URL yet. The `ready-to-show` event isn't being used for the softphone window (unlike chat/settings which use it). The window shows before the hash route is parsed, so React briefly renders the default route (chat).

**Fix** in `electron/main.cjs`:
- Add `ready-to-show` handling to `createSoftphoneWindow()` — don't show the window until content is loaded
- In `toggleSoftphone()`, if creating a new window, wait for `ready-to-show` before showing

## Files to modify

| File | Change |
|------|--------|
| `electron/icons/app-icon.png` | Copy from Centelos project assets |
| `electron/main.cjs` | Add `setAppUserModelId`, use `app-icon.png` for windows, add `ready-to-show` to softphone |

