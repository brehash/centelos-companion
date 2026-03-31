

# Fix Three Issues: Message Caching, Call-from-Chat, and Softphone Routing

## Issue 1: Softphone loads chat instead of softphone UI

**Root cause**: `electron/main.cjs` `loadRoute()` in dev mode loads `http://localhost:8080/softphone`, but the app uses `HashRouter`. The correct URL should be `http://localhost:8080/#/softphone`. Since `/softphone` isn't a real server route, Vite serves `index.html`, React mounts, and the hash is empty — so it renders the default route (chat).

**Fix in `electron/main.cjs`**: Change dev URL from `http://localhost:8080${route}` to `http://localhost:8080/#${route}`.

## Issue 2: Can't call a user from chat window

**Root cause**: The call button in chat calls `phone.makeCall(recipientExt)`. In Electron, the chat window uses the delegate hook which sends `requestCall(number)` via IPC. The IPC relay in `main.cjs` forwards to softphone. However, the delegate reports `phoneStatus` as `"offline"` until the softphone broadcasts state — and the call button is disabled when `phone.phoneStatus !== "registered"`. The delegate currently derives `phoneStatus` from `extensionNumber` presence, which is only set when a broadcast arrives.

**Fix**:
- In the delegate hook (`useVoicePhoneDelegate`), also track `phoneStatus` from the broadcast state. Add `phoneStatus` to `CrossWindowCallState` interface and broadcast it from the primary hook.
- In ChatWindow's `handleCall`, also call `window.electronAPI?.focusSoftphone()` to show the softphone window when initiating a call.
- Update `CrossWindowCallState` interface in `ElectronContext.tsx` to include `phoneStatus`.

## Issue 3: Chat always shows preloader when switching conversations

**Root cause**: `chatReady` is `!!user && !!currentWorkspace && !loading`. Every time you select a new conversation, `useChatMessages` sets `loading = true`, fetches messages, then sets `loading = false`. This re-triggers the full-screen preloader.

**Fix**: Split the preloader into two concerns:
1. **Initial app preloader** (full-screen blur): Only shows until `user` and `currentWorkspace` are available. Remove `!loading` from this condition.
2. **Message loading**: Show an inline spinner in the message area when `loading` is true (not the full-screen overlay). This way switching chats shows a subtle inline loader, not the full blocking preloader.

## Files to modify

| File | Change |
|------|--------|
| `electron/main.cjs` | Fix `loadRoute` to use `/#${route}` in dev mode |
| `src/hooks/useVoicePhone.ts` | Add `phoneStatus` to broadcast state; track it in delegate |
| `src/contexts/ElectronContext.tsx` | Add `phoneStatus` to `CrossWindowCallState` |
| `src/pages/ChatWindow.tsx` | Fix preloader to only block on auth/workspace, not message loading; add `focusSoftphone()` to `handleCall` |

