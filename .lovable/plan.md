

# Fix: Native Notification "Answer" Should Auto-Accept the Call

## Problem
When clicking "Answer" on the incoming call native notification, the softphone window opens but the call isn't automatically accepted — the user has to click "Answer" again in the softphone UI.

**Root cause**: Electron's `Notification` action buttons (`notif.on("action")`) only work on **macOS**. On Windows, the `action` event never fires. The `click` event fires when the notification body is clicked, but it only shows/focuses the softphone — it doesn't send an accept command.

## Solution
In `electron/main.cjs`, when a call notification is clicked, also send `call:accept` to the softphone window so it auto-answers:

### `electron/main.cjs` changes
1. In the `notif.on("click")` handler for call notifications, add `sendToWindow(softphoneWin, "call:accept")` after showing/focusing the softphone
2. In the `notif.on("action")` handler (for macOS), when action is "answer", also send `sendToWindow(softphoneWin, "call:accept")` as a backup — don't rely solely on `notification:action` IPC

### `src/hooks/useVoicePhone.ts` changes
3. In the `onCallAcceptRequest` handler (the IPC listener for `call:accept`), add the same logic that the `onNotificationAction("answer")` handler uses: call `incomingCallRef.current.accept()` and `setupCallListeners()`
4. Currently the `onCallAcceptRequest` listener (lines ~505-510) likely calls `acceptCall()` — verify it properly accepts the Twilio call object

This way:
- **Windows**: Clicking the notification → `click` event → shows softphone + sends `call:accept` → softphone auto-answers
- **macOS**: Clicking "Answer" button → `action` event → same flow

## Files to modify

| File | Change |
|------|--------|
| `electron/main.cjs` | Add `sendToWindow(softphoneWin, "call:accept")` to notification `click` handler for call type |
| `src/hooks/useVoicePhone.ts` | Ensure `onCallAcceptRequest` handler properly accepts the incoming Twilio call |

