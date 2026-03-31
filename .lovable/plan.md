

# Connect Desktop App to Live Centelos Backend

## Problem
The desktop app currently has dummy/demo data for chat and softphone. It needs to use the same Supabase backend as Centelos so that logging in makes the user "online", chat messages are real, and incoming calls trigger native Windows notifications with Answer/Reject buttons.

## Approach
Port the essential contexts, hooks, and components from the Centelos project into this desktop app, adapting them for the Electron environment. The key systems to bring over:

1. **WorkspaceContext** — fetches user's workspaces from Supabase
2. **PresenceContext** — manages online/offline status and syncs across devices
3. **VoicePhoneContext + useVoicePhone** — Twilio Voice SDK integration for real calls
4. **useBackgroundRingers** — monitors calls on non-active workspaces
5. **useChatMessages** — real-time chat with Supabase
6. **useChatNotifications** — triggers notifications on new messages
7. **useTypingIndicator** — typing presence
8. **ChatSidebar + Chat page** — real chat UI from Centelos
9. **Native Electron notifications** — for calls and messages with action buttons

## Plan

### Step 1: Add Workspace & Presence contexts
- Copy `WorkspaceContext.tsx` from Centelos (adapted — remove Centelos-specific fields like twilio_trust_product, logo_upload, fraud_suspension etc. or keep them for compatibility)
- Copy `PresenceContext.tsx` from Centelos — this handles online status, "in-call" status broadcast, and realtime presence channel
- Wire both into `App.tsx` provider tree (WorkspaceProvider wraps PresenceProvider wraps routes)

### Step 2: Add VoicePhone system for real softphone
- Copy `useVoicePhone.ts` from Centelos — this is the full Twilio Voice SDK hook (Device registration, incoming/outgoing calls, hold, transfer, DTMF, mute)
- Copy `VoicePhoneContext.tsx` and `useBackgroundRingers.ts`
- Install `@twilio/voice-sdk` dependency
- Rewrite `Softphone.tsx` to use `useVoicePhoneContext()` instead of local simulated state — mirroring Centelos's `SoftphoneWidget.tsx` logic but in the standalone window layout

### Step 3: Add real chat system
- Copy hooks: `useChatMessages.ts`, `useChatNotifications.ts`, `useTypingIndicator.ts`
- Copy components: `CreateGroupDialog.tsx`, `ChatLightbox.tsx`
- Copy utility files: `image-utils.ts`, `file-hash.ts`, `emoticons.ts` from Centelos `src/lib/`
- Rewrite `ChatWindow.tsx` to use real Supabase data — port the full `Chat.tsx` from Centelos (1894 lines), adapted to work in the standalone frameless window layout (no dashboard navigation, uses `FramelessTitleBar`)
- Rewrite the chat sidebar to use real presence members, groups, unread counts — port from Centelos's `ChatSidebar.tsx`

### Step 4: Native Electron notifications with action buttons
- Update `electron/main.cjs`: handle `notification:show` IPC with native `Notification` API
  - For incoming calls: show notification with "Answer" and "Reject" action buttons (Windows toast actions)
  - For chat messages: show notification that clicks to open chat window
- Update `electron/preload.cjs`: add `onIncomingCall` and `onNotificationAction` IPC channels
- In the renderer, modify `useChatNotifications` to call `electronAPI.showNotification()` instead of browser `Notification` API when running in Electron
- For incoming calls, the `VoicePhoneContext` will trigger native notification via `electronAPI.showNotification({ title, body, type: 'call' })` and listen for answer/reject responses via IPC

### Step 5: Update App.tsx provider hierarchy and routing
- Add `WorkspaceProvider` and `PresenceProvider` wrapping protected routes
- Add `VoicePhoneProvider` inside the workspace/presence providers
- Add chat sub-routes: `/chat/:userId`, `/chat/group/:groupId`
- On login, call `registerDesktopDevice()` and set presence to online
- On logout/quit, set presence to offline

### Step 6: Tray badge integration
- Use `useUnreadCount` / `useGlobalUnreadCount` from Centelos to get real unread counts
- Call `electronAPI.setTrayBadge(count)` whenever unread count changes
- This makes the tray icon show actual unread message counts

## Dependencies to install
- `@twilio/voice-sdk` — for real voice calls
- `@emoji-mart/data` and `@emoji-mart/react` — for emoji picker in chat (matching Centelos)

## Files to create/modify (summary)
- **Create**: ~10 new files (contexts, hooks, utilities ported from Centelos)
- **Rewrite**: `Softphone.tsx`, `ChatWindow.tsx` (replace dummy data with real Supabase integration)
- **Modify**: `App.tsx` (provider tree + routes), `electron/main.cjs` (native notifications), `electron/preload.cjs` (new IPC channels)

## What will work after this
- Login makes user appear "online" in Centelos web app and desktop app simultaneously
- Real chat messages sync in real-time between web and desktop
- Incoming calls show native Windows toast notifications with Answer/Reject buttons
- Chat notifications show native Windows toasts
- Tray icon shows real unread count
- Typing indicators work across web and desktop
- The desktop app is a fully functional second endpoint

