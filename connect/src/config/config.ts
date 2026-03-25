import type { DetectedOS } from "@/lib/platform";

export type DownloadAsset = {
  label: string;
  filename: string;
  description: string;
  isDefault?: boolean;
  comingSoon?: boolean;
};

const DOWNLOAD_VERSION = "0.7.48";
const DATA_CONNECT_GITHUB_RELEASES_URL =
  "https://github.com/vana-com/data-connect/releases";

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
      comingSoon: true,
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
  return `${DATA_CONNECT_GITHUB_RELEASES_URL}/download/v${DOWNLOAD_VERSION}/${filename}`;
}

export const CONNECT_CONFIG = {
  app: {
    siteUrl: "https://account.vana.org",
    name: "DataConnect",
    description: "Connect and export your data into your Personal Server.",
  },
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
    githubReleasesUrl: DATA_CONNECT_GITHUB_RELEASES_URL,
    assets: downloadAssets,
  },
  docs: {
    learnMoreUrl: "#",
    docsSiteUrl: "https://docs.vana.org",
    dataConnectGithubUrl: "https://github.com/vana-com/data-connect",
    vanaConnectGithubUrl: "https://github.com/vana-com/vana-connect",
    exampleAppUrl:
      "https://github.com/vana-com/vana-connect/tree/main/examples/nextjs-starter",
  },
  support: {
    email: "support@vana.org",
  },
} as const;
