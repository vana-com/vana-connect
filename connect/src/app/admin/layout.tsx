import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminAuthGuard } from "./_components/admin-auth-guard";

export const metadata: Metadata = {
  title: "Register app",
  description: "Register your app URL and generate Vana Connect credentials.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}
