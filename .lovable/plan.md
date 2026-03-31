

# Fix Platform Detection + Confirm Real Chat Data

## What's happening
The screenshot shows dummy data ("John Doe", "Jane Smith") from an **old Electron build**. The current codebase has already been updated to use real Supabase data -- there are zero hardcoded dummy names in ChatWindow.tsx or ChatSidebar.tsx. The network requests confirm real data flows (extensions, profiles, presence all working). The user needs to rebuild the Electron app to see the changes.

## Changes

### 1. Fix `electron/preload.cjs` -- hardcode `platform: 'windows'`
Change `platform: process.platform` to `platform: 'windows'` so Centelos detection logic works correctly for this Windows desktop app.

### 2. Verify no dummy data remains anywhere
Search already confirmed: no "John Doe", "Jane Smith", "Mike Johnson", "Sarah Wilson", or "Team Chat" exist in ChatWindow.tsx, ChatSidebar.tsx, or any chat-related file. The only occurrence is in `NotificationExample.tsx` (a test/demo component not used in the chat flow).

### 3. Remove `NotificationExample.tsx` dummy component
Delete `src/components/NotificationExample.tsx` which contains the only remaining dummy names -- it's a leftover test component that should not exist in the production app.

## Technical details
- **File**: `electron/preload.cjs` line 38 -- change `platform: process.platform` to `platform: 'windows'`
- **Delete**: `src/components/NotificationExample.tsx`
- After these changes, the user must rebuild and repackage the Electron app to see the real chat data

