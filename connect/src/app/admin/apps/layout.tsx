import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Your apps",
  description: "Manage your registered Vana Connect applications.",
};

export default function AdminAppsLayout({ children }: { children: ReactNode }) {
  return children;
}
