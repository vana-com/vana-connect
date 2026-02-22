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
