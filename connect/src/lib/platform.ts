export type DetectedOS = "macOS" | "Windows" | "Linux" | "unknown";

export function detectOS(): DetectedOS {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua) && !/Android/.test(ua)) return "Linux";
  return "unknown";
}

export function getDownloadPlatformLabel(): string {
  const os = detectOS();
  return os === "unknown" ? "your OS" : os;
}

// Phones and tablets. The DCR handoff hands a `vana://` deep link to the OS,
// but `vana://` is owned by the desktop DataConnect/Vana Tauri apps — there is
// no mobile DataConnect, so on a phone the link is claimed by the native Vana
// app (or nothing) and the approval dead-ends (BUI-449). Detect mobile so the
// handoff can offer a "finish on a computer" path instead of a broken button.
// iPadOS ≥13 reports a desktop Safari UA, so also treat touch-capable "Mac" as
// mobile (real Macs are not multi-touch).
export function isMobileUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) {
    return true;
  }
  // iPadOS masquerading as macOS Safari.
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) {
    return true;
  }
  return false;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isMobileUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
