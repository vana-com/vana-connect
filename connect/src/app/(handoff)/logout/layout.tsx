import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Signing out",
  description: "Signing you out of Vana Connect.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LogoutLayout({ children }: { children: ReactNode }) {
  return children;
}
