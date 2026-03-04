import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peak Think \u2014 Cognitive Performance Analyzer",
  description:
    "Discover when your mind does its best work by cross-referencing Oura sleep data with ChatGPT conversation quality",
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
