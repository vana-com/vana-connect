import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talk to You",
  description: "Chat with an AI version of yourself, built from your own data",
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
