import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Download DataConnect",
  description: "Download DataConnect for macOS or Linux to export your data.",
};

export default function DownloadDataConnectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
