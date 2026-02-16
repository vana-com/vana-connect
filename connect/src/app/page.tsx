"use client";

import { App as AuthForm } from "@/app/_auth/components/auth-form";
import { PageShell } from "@/app/_components/page-shell";

export default function Page() {
  return (
    <PageShell>
      <AuthForm />
    </PageShell>
  );
}
