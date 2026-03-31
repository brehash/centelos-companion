

# Gap Analysis: Desktop Chat vs Centelos Web Chat

## What IS working (confirmed via network requests)
- Authentication against real Supabase backend
- Workspace fetching (AirFiber WISP loaded correctly)
- Presence updates (online status broadcasting)
- Extensions list (all 19 extensions loaded)
- Profile resolution (all member names loaded)
- Unread count polling (DM + group)
- Real-time Supabase channels subscribed

## What the user likely means by "dummy data"
The desktop `ChatWindow.tsx` is **374 lines** while Centelos `Chat.tsx` is **1894 lines**. The desktop version is a stripped-down port missing many features from the original. The visual experience is significantly less polished, which may make it feel "not connected" even though data flows correctly.

## Key missing features (Centelos web has, desktop doesn't)

1. **URL rendering** -- Centelos renders clickable links in messages; desktop shows plain text
2. **Date separators** -- "Today", "Yesterday", "Monday" dividers between message groups
3. **Emoji picker** -- Centelos uses `@emoji-mart/react`; desktop has no emoji UI
4. **Read receipts** -- double-check marks for read messages
5. **Message search** -- sidebar search across messages
6. **Emoticon replacement** -- `:)` to emoji conversion via `replaceEmoticons`
7. **Image processing** -- Centelos uses `processImageFile` for compression/resize before upload
8. **File hash dedup** -- prevents duplicate file uploads
9. **Forward dialog** -- user picker for forwarding messages
10. **Group management** -- add/remove members, leave group, rename
11. **Contact info sheet** -- sliding panel with user details
12. **Mobile responsive layout** -- back button, collapsible sidebar
13. **Inline support chat** -- `InlineSupportChat` component
14. **Copy message** -- copy text to clipboard action

## Plan

### Step 1: Port the full message rendering from Centelos
- Add `renderMessageContent()` with URL detection and clickable links
- Add `getDateLabel()` for date separators between messages
- Add `replaceEmoticons()` integration for emoticon-to-emoji conversion
- Add read receipt indicators (CheckCheck icon for read, Check for sent)

### Step 2: Add emoji picker
- Import `@emoji-mart/data` and `@emoji-mart/react` (already in dependencies)
- Add emoji button next to send, with popover picker
- Insert selected emoji into message input

### Step 3: Port full file upload with image processing
- Use `processImageFile()` for image compression before upload
- Use `computeFileHash()` for dedup
- Show upload progress indicator
- Better file preview in messages (thumbnails, download buttons)

### Step 4: Add forward dialog
- Port the forward user picker from Centelos
- Show member list to pick forward target

### Step 5: Add group management features
- Add/remove members from groups
- Leave group action
- Rename group (for creator/admin)
- Show member list in group info panel

### Step 6: Add message search
- Search input in sidebar header
- Filter messages by search term
- Highlight matching text in results

### Step 7: Enhance message actions
- Copy message to clipboard
- Better context menu / hover actions
- Confirmation dialog for delete

### Step 8: Port the contact info sheet
- Sliding panel showing user details when clicking avatar/name
- Extension number, online status, call button

## Files to modify
- `src/pages/ChatWindow.tsx` -- major rewrite to port full Centelos Chat.tsx features
- `src/components/ChatSidebar.tsx` -- add search, improve group management UI
- `src/components/CreateGroupDialog.tsx` -- ensure group creation with member selection works

## Dependencies needed
- `@emoji-mart/data` and `@emoji-mart/react` (may need to be installed)

