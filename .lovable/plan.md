

# Softphone: Show in Taskbar & Don't Auto-Hide During Calls

## Problem
The softphone has `skipTaskbar: true` and auto-hides on blur. During a call, switching to another app causes the softphone to disappear — the user can't get back to it easily.

## Changes

### 1. Show softphone in taskbar (`electron/main.cjs`)
- Change `skipTaskbar: true` to `skipTaskbar: false` in `createSoftphoneWindow()`
- Set the icon to `tray-icon.png` (already done) so the Centelos logo shows in the taskbar

### 2. Don't auto-hide during a call (`electron/main.cjs`)
- Track an `isInCall` flag in main process
- Add IPC listener `call:in-progress` that sets the flag
- In the `blur` handler, only auto-hide if `!isInCall`
- The softphone renderer broadcasts this via existing `call:state-changed` — listen for `callStatus` being `"in-call"` or `"ringing-in"` or `"ringing-out"`

### 3. Add title bar with minimize to Softphone (`src/pages/Softphone.tsx`)
- The softphone already has `<FramelessTitleBar>` — add `showMinimize={true}` so the user can minimize to taskbar instead of only closing

### 4. Broadcast in-call state from softphone to main process
- In `electron/main.cjs`, update the existing `call:state-changed` handler to also set `isInCall` based on the state's `callStatus`

## Files to modify

| File | Change |
|------|--------|
| `electron/main.cjs` | `skipTaskbar: false`, conditional auto-hide based on call state |
| `src/pages/Softphone.tsx` | Add `showMinimize={true}` to FramelessTitleBar |

