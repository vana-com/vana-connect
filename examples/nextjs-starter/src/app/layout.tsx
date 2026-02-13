import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vana Connect — Next.js Starter",
  description: "Example app for the Vana Connect SDK",
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
