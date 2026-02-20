import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Analyzer — LinkedIn + Spotify Insights",
  description:
    "Connect your LinkedIn and Spotify data to get personalized career insights",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
