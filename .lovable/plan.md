

# Startup Flow + Preloaders + App Icon

## Changes

### 1. Show app on startup (don't hide to tray)
**`electron/main.cjs`** -- In `app.whenReady()`, change startup to always show. Replace the current logic that only shows if `!settings.startInTray` with unconditional show. Also open the **chat window** instead of (or alongside) softphone on first launch.

```js
app.whenReady().then(() => {
  createTray();
  createSoftphoneWindow(); // keep creating it (hidden, for VoIP registration)
  createChatWindow();      // open chat window on startup
});
```

### 2. After login, navigate to chat instead of softphone
**`src/pages/Index.tsx`** -- Change the Electron redirect from `/softphone` to `/chat`:
```js
if (isElectron && user) return <Navigate to="/chat" replace />;
```

### 3. Full-window preloader for Softphone
**`src/pages/Softphone.tsx`** -- Add a loading overlay that shows "Softphone starting..." with a blurred background until the VoIP device is registered. Check `phone.isRegistered` or equivalent ready state. Overlay uses `backdrop-blur-sm` with a centered spinner and text. Dismiss once the device fires `registered` event.

### 4. Full-window preloader for Chat
**`src/pages/ChatWindow.tsx`** -- Add a similar loading overlay "Loading chat..." with blurred background that shows until:
- Auth is resolved
- Workspace is loaded
- Initial conversations list is fetched

Once all three are truthy, fade out the overlay.

### 5. Copy Centelos logo as app/tray icon
Copy `favicon.png` from the Centelos project (`public/favicon.png`) to `electron/icons/tray-icon.png` (replacing the existing one) and to `public/favicon.png` for in-app use. Also copy `favicon.ico` for the Electron window icon.

**`electron/main.cjs`** -- Set the app icon on all BrowserWindows:
```js
icon: path.join(__dirname, "icons", "tray-icon.png")
```
And update the tray icon path (already using this path).

## Files to modify
| File | Change |
|------|--------|
| `electron/main.cjs` | Startup: show chat window, keep softphone hidden; add icon to all windows |
| `src/pages/Index.tsx` | Redirect to `/chat` instead of `/softphone` |
| `src/pages/Softphone.tsx` | Add blurred preloader overlay until VoIP registered |
| `src/pages/ChatWindow.tsx` | Add blurred preloader overlay until data loaded |
| `electron/icons/tray-icon.png` | Replace with Centelos favicon |
| `public/favicon.png` | Copy from Centelos project |

