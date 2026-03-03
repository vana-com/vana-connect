import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Connect data",
  description: "Approve the connection flow to share data with your app.",
};

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return children;
}
