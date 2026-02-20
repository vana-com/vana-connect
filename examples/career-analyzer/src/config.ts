import { createVanaConfig } from "@opendatalabs/connect/server";

const SCOPES = [
  "linkedin.profile",
  // "linkedin.experience",
  // "linkedin.education",
  // "linkedin.skills",
  // "spotify.savedTracks",
  // "spotify.playlists",
  // "chatgpt.conversations"
];

export const config = createVanaConfig({
  privateKey: process.env.VANA_PRIVATE_KEY as `0x${string}`,
  scopes: SCOPES,
  appUrl: process.env.APP_URL!,
  environment: (process.env.VANA_ENV as "dev" | "prod") ?? "dev",
});
