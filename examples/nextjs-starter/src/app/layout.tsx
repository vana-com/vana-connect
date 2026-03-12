import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad Insights — powered by Vana",
  description: "See which advertisers target you on Instagram",
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
