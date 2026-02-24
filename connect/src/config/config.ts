import type { DetectedOS } from "@/lib/platform";

export type DownloadAsset = {
  label: string;
  filename: string;
  description: string;
  isDefault?: boolean;
};

const DOWNLOAD_VERSION = "0.7.22";

const downloadAssets: Record<
  Exclude<DetectedOS, "unknown">,
  DownloadAsset[]
> = {
  macOS: [
    {
      label: "macOS (Apple Silicon)",
      filename: `DataConnect_${DOWNLOAD_VERSION}_aarch64.dmg`,
      description: "For M1, M2, M3, M4 Macs",
      isDefault: true,
    },
    {
      label: "macOS (Intel)",
      filename: `DataConnect_${DOWNLOAD_VERSION}_x64.dmg`,
      description: "For older Intel Macs",
    },
  ],
  Windows: [
    {
      label: "Windows (x64)",
      filename: `DataConnect_${DOWNLOAD_VERSION}_x64-setup.exe`,
      description: "64-bit installer",
      isDefault: true,
    },
  ],
  Linux: [
    {
      label: "Linux (.deb)",
      filename: `DataConnect_${DOWNLOAD_VERSION}_amd64.deb`,
      description: "Debian / Ubuntu",
      isDefault: true,
    },
    {
      label: "Linux (AppImage)",
      filename: `DataConnect_${DOWNLOAD_VERSION}_amd64.AppImage`,
      description: "Portable, any distro",
    },
  ],
};

export function getAssetUrl(filename: string): string {
  return `https://github.com/vana-com/data-connect/releases/download/v${DOWNLOAD_VERSION}/${filename}`;
}

export const CONNECT_CONFIG = {
  legal: {
    privacyPolicyUrl: "https://www.vana.org/privacy",
    termsOfServiceUrl: "https://www.vana.org/terms",
    foundationSoftwareUse: {
      combinedTermsUrl:
        "https://github.com/vana-com/data-connect/blob/main/legal/dataconnect-terms-privacy-eula.md",
      lastUpdatedLabel: "6 Feb, 2026",
    },
  },
  downloads: {
    version: DOWNLOAD_VERSION,
    githubReleasesUrl: "https://github.com/vana-com/data-connect/releases",
    assets: downloadAssets,
  },
  docs: {
    learnMoreUrl: "#",
    dataConnectGithubUrl: "https://github.com/vana-com/data-connect",
    exampleAppUrl:
      "https://github.com/vana-com/vana-connect/tree/main/examples/nextjs-starter",
  },
  support: {
    email: "support@vana.org",
  },
} as const;
