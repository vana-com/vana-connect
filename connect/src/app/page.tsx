"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { App as AuthForm } from "@/app/_auth/components/auth-form";
import { PageShell } from "@/app/_components/page-shell";

function PageContent() {
  const searchParams = useSearchParams();
  const isDesktopHandoff = searchParams.get("mode") === "return_to_app";

  return (
    <PageShell showBackButton={!isDesktopHandoff}>
      <AuthForm />
    </PageShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
