import { supabase } from "./supabase";

const DEVICE_KEY = "centelos-desktop-device-id";

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `desktop_${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Register this desktop app as a separate device/endpoint for the logged-in user.
 * Centelos can treat this as a distinct "device" alongside the web desk phone.
 */
export async function registerDesktopDevice(userId: string, workspaceId: string) {
  const deviceId = getDeviceId();

  // Upsert a device registration record
  // This uses a custom table `desktop_devices` — needs to exist in Centelos DB
  try {
    await supabase.from("desktop_devices").upsert(
      {
        device_id: deviceId,
        user_id: userId,
        workspace_id: workspaceId,
        device_type: "desktop_app",
        last_seen: new Date().toISOString(),
        user_agent: navigator.userAgent,
      },
      { onConflict: "device_id" }
    );
  } catch (err) {
    console.warn("Desktop device registration failed:", err);
  }

  return deviceId;
}

export function getStoredDeviceId(): string {
  return getDeviceId();
}
