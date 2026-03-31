

# Fix Login redirect to Chat

The `Index.tsx` redirect is already correct (`/chat`), but `Login.tsx` still navigates to `/softphone` in two places.

## Changes

**`src/pages/Login.tsx`**:
- Line 20: Change `navigate("/softphone", { replace: true })` to `navigate("/chat", { replace: true })`
- Line 33: Change `navigate("/softphone", { replace: true })` to `navigate("/chat", { replace: true })`

