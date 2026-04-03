

# Redesign Softphone with Two-Panel Layout (Reference Screenshot Style)

## Overview
Redesign the softphone from a single-column 300px layout to a wider two-panel layout inspired by the InContact CTI screenshot: a narrow left navigation sidebar and a right content area showing the dial pad, call controls, etc.

## Layout

```text
┌──────────────────────────────────────────┐
│  Centelos Softphone  [title bar]   - x   │
├────────────┬─────────────────────────────┤
│ User Info  │                             │
│ Ext 1001   │   0911328          ⌫       │
│ ● Online   │   ─────────────────         │
│────────────│                             │
│ 📞 Phone   │    1    2    3              │
│            │   ABC  ABC  ABC             │
│ 🕐 History │    4    5    6              │
│            │   ABC  ABC  ABC             │
│ 👤 Contacts│    7    8    9              │
│            │   ABC  ABC  ABC             │
│            │    *    0    #              │
│            │   ABC  ABC  ABC             │
│            │                             │
│            │  [  📞  Call  ────────── ]  │
│────────────│                             │
│ 🎧 Audio   │                             │
└────────────┴─────────────────────────────┘
```

## Changes

### 1. Widen softphone window (`electron/main.cjs`)
- Change `SOFTPHONE_WIDTH` from `300` to `520`
- Adjust x-position calculation accordingly

### 2. Redesign `Softphone.tsx` to two-panel layout
- **Left sidebar** (~140px, dark bg matching the screenshot style):
  - User info section at top: avatar/initials, extension number, registration status dot
  - Navigation items: Phone (dial pad), Call History (placeholder/future), Contacts (extension list)
  - Audio Devices toggle at bottom
- **Right content area** (flex-1):
  - Shows the active panel content based on sidebar selection
  - **Phone panel** (default): dial input + dial pad + call button — styled like the screenshot with larger digits, letter labels (ABC, DEF, etc.), and a green call bar at the bottom
  - **Contacts panel**: scrollable list of extensions from current workspace
  - **Call History panel**: placeholder "Coming soon" for now
  - In-call state, incoming call banner, transfer picker all render in the right panel as they do now

### 3. Restyle `DialPad.tsx`
- Larger buttons with phone-style letter labels beneath each digit (2=ABC, 3=DEF, etc.)
- Clean white/light background style matching the screenshot
- Green call button bar at the bottom spanning full width

### 4. Keep all existing functionality intact
- Keyboard shortcuts, @-mention search, DTMF in-call, transfer picker, audio device selection — all remain, just repositioned into the new layout

## Files to modify

| File | Change |
|------|--------|
| `electron/main.cjs` | `SOFTPHONE_WIDTH = 520`, adjust x position |
| `src/pages/Softphone.tsx` | Two-panel layout with sidebar nav + content area |
| `src/components/DialPad.tsx` | Larger buttons with phone letter labels |

