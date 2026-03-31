

# Fix Cross-Window Real-Time Features in Electron

## Root Cause

The Electron app runs **two separate BrowserWindows** (softphone + chat), each with its own React app instance and independent contexts. They share zero state. When chat calls `phone.makeCall()`, it creates a **second** Twilio Device -- the softphone window never learns about the call. Typing indicators, notifications, and call state are all siloed per window.

## Architecture Fix: Single VoIP Owner + IPC Bridge

Only the **softphone window** should own the Twilio VoIP device. The chat window delegates call actions via IPC through `electron/main.cjs`. All shared state (call status, incoming calls) is broadcast from main process to all windows.

```text
┌──────────────┐    IPC     ┌──────────────┐    IPC     ┌──────────────┐
│  Chat Window │ ────────── │  Main Process │ ────────── │  Softphone   │
│  (no Device) │            │  (relay hub)  │            │  (owns VoIP) │
└──────────────┘            └──────────────┘            └──────────────┘
```

## Changes

### 1. Add IPC channels for cross-window communication

**`electron/main.cjs`** -- Add relay IPC handlers:
- `call:make` -- chat sends target number, main relays to softphone
- `call:hangup` -- chat requests hangup, main relays to softphone  
- `call:state-changed` -- softphone broadcasts call state, main relays to chat
- `call:accept` / `call:reject` -- forwarded to softphone from any window
- `window:focus-softphone` -- shows/focuses softphone when call starts from chat

### 2. Extend preload.cjs with cross-window call APIs

**`electron/preload.cjs`** -- Add to `electronAPI`:
- `requestCall(number)` -- sends `call:make` to main
- `requestHangup()` -- sends `call:hangup` to main
- `requestAcceptCall()` / `requestRejectCall()`
- `onCallStateChanged(callback)` -- listens for call state broadcasts
- `broadcastCallState(state)` -- softphone sends its call state to main

### 3. Modify useVoicePhone.ts -- detect window role

**`src/hooks/useVoicePhone.ts`**:
- Check if current route is `/softphone` (primary VoIP owner) vs `/chat` (delegate)
- If softphone: register Twilio Device as before, but also broadcast state changes via `electronAPI.broadcastCallState()`
- If chat window in Electron: do NOT create a Twilio Device. Instead, `makeCall()` calls `electronAPI.requestCall()`, `hangUp()` calls `electronAPI.requestHangup()`, and listen to `onCallStateChanged` to mirror state (callStatus, incomingFrom, etc.)

### 4. Fix native notifications for incoming calls

**`src/hooks/useVoicePhone.ts`** line 277 -- Already calls `showNotification` on incoming. The issue is the softphone window may be hidden (no focus). Fix: ensure `showNotification` fires regardless of window visibility. Also add notification for outgoing calls from chat.

### 5. Fix incoming call notification actions

**`src/hooks/useVoicePhone.ts`** -- Add `onNotificationAction` listener so when user clicks "Answer" on native notification, the softphone's VoicePhone hook calls `acceptCall()`.

### 6. Typing indicators already work cross-window

Typing uses Supabase Presence channels (server-side), so both windows independently subscribe. No changes needed here -- this should work if both windows are authenticated.

**Possible issue**: If the chat window was loaded but the user hasn't selected a conversation, the typing channel isn't subscribed. This is by design.

## Files to modify

| File | Change |
|------|--------|
| `electron/main.cjs` | Add 5 IPC relay handlers for call state |
| `electron/preload.cjs` | Add 6 new electronAPI methods for call delegation |
| `src/contexts/ElectronContext.tsx` | Extend ElectronAPI interface with new methods |
| `src/hooks/useVoicePhone.ts` | Add window-role detection; delegate mode for chat window |
| `src/pages/Softphone.tsx` | Broadcast call state changes to main process |

## Technical detail: Call state broadcast shape

```typescript
interface CrossWindowCallState {
  callStatus: "idle" | "ringing-in" | "ringing-out" | "in-call";
  incomingFrom: string | null;
  isMuted: boolean;
  isOnHold: boolean;
  callDuration: number;
  extensionNumber: string | null;
}
```

Softphone broadcasts this on every state change. Chat window mirrors it for UI display (shows "In Call" status, hang-up button, etc.).

