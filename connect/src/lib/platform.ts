const DEFAULT_DOWNLOAD_PLATFORM_LABEL = "macOS";

export function getDownloadPlatformLabel() {
  // TODO: Replace with runtime OS detection when browser sniffing is enabled.
  return DEFAULT_DOWNLOAD_PLATFORM_LABEL;
}
