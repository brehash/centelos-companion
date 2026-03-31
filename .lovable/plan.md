
# Centelos Desktop Softphone — Electron App

## Overview
A Windows desktop Electron application that acts as a companion softphone/chat client for Centelos, living in the system tray with floating windows for calls and chat.

## Architecture

### Electron Main Process (`electron/main.cjs`)
- **System Tray**: App starts minimized to tray with custom icon
- **Tray Context Menu**: "Open Softphone", "Open Chat" (with unread badge), "Settings", separator, "Quit"
- **Tray Click**: Toggles the softphone floating window
- **Two BrowserWindows**:
  - **Softphone Window**: 300×500, frameless, always-on-top, top-right positioned, not in taskbar, hides on blur
  - **Chat Window**: ~800×600, frameless (custom title bar with close/minimize), no navigation chrome

### Preload Script (`electron/preload.cjs`)
- Expose IPC bridge for: window control (close, minimize, hide), notification triggers, tray badge updates, theme changes, app settings read/write

### Renderer (React App — this project)
Routes:
- `/softphone` — Softphone UI (dial pad, call controls, call status)
- `/chat` — Chat interface only (DM list + conversation, group chats, no sidebar/nav)
- `/settings` — Settings panel (startup mode, appearance theme, sign out)
- `/login` — Auth screen to sign into Centelos

## Pages & Components

### 1. Login Page
- Email/password sign in using Centelos Supabase instance
- Registers device as "Desktop App" type so Centelos can distinguish it from the web desk phone
- Persist session securely via Electron store
- Sign out option available in Settings

### 2. Softphone Window (`/softphone`)
- Replicate the SoftphoneWidget UI from Centelos:
  - Dial pad (1-9, *, 0, #)
  - Number input field with @ extension search
  - Call/hangup buttons
  - In-call view: mute, hold, transfer, duration timer
  - Incoming call banner with accept/reject
  - Audio device selector
  - Extension status indicator (registered/connecting/error)
- Custom frameless title bar with drag region and close (hide) button
- Keyboard numpad support
- Prepared hooks for future WebRTC/SIP integration

### 3. Chat Window (`/chat`)
- Chat sidebar (DM list + group list) on the left (~250px)
- Conversation view on the right
- Full chat functionality from Centelos: send messages, file attachments, emoji reactions, reply, forward, edit, delete, image lightbox, typing indicators
- Ability to initiate calls from chat
- Group chat creation and management
- Custom frameless title bar with minimize and close buttons
- No main navigation — chat only

### 4. Settings Page
- **Startup Mode**: Toggle between "Start in tray" vs "Start with window open"
- **Appearance**: System / Dark / Light theme (default: System)
- **Sign Out**: Button to log out and return to login screen
- Settings persisted via electron-store

### 5. Notifications
- Native Windows notifications for:
  - Incoming calls (with answer/reject actions)
  - New chat messages (click opens chat window)
- Tray icon badge/overlay for unread message count
- Notification bubble count shown in tray context menu next to "Open Chat"

## Device Identity
- On login, register this client as a separate "desktop_app" device type in Centelos
- Use a distinct user-agent or device identifier so Centelos treats it as a separate endpoint from the web desk phone
- This allows the desktop app to receive calls independently

## UX Behavior
- Softphone window: click tray → show, click again → hide, lose focus → auto-hide (with debounce to prevent flicker)
- Chat window: opened via tray menu, stays open until explicitly closed
- Smooth animations on show/hide (opacity + transform)
- Windows 10/11 compatible

## Design System
- Reuse Centelos design tokens (HSL color variables, Tailwind config)
- Same component library (shadcn/ui)
- Dark/light/system theme support matching Centelos appearance

## File Structure
```
electron/
  main.cjs          — Main process (tray, windows, IPC)
  preload.cjs       — Context bridge
  icons/             — Tray icons
src/
  pages/
    Login.tsx
    Softphone.tsx
    ChatWindow.tsx
    Settings.tsx
  components/
    DialPad.tsx
    CallControls.tsx
    IncomingCallBanner.tsx
    ChatConversation.tsx
    ChatSidebar.tsx (desktop-specific)
    FramelessTitleBar.tsx
    NotificationExample.tsx
  contexts/
    AuthContext.tsx
    ThemeContext.tsx
    ElectronContext.tsx
  hooks/
    useElectronIPC.ts
    useTrayBadge.ts
  lib/
    supabase.ts
    deviceIdentity.ts
```
