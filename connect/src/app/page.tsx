"use client";

import { useSearchParams } from "next/navigation";
import { App as AuthForm } from "@/app/_auth/components/auth-form";
import { PageShell } from "@/app/_components/page-shell";

export default function Page() {
  const searchParams = useSearchParams();
  const isDesktopHandoff = searchParams.get("mode") === "return_to_app";

  return (
    <PageShell showBackButton={!isDesktopHandoff}>
      <AuthForm />
    </PageShell>
  );
}
