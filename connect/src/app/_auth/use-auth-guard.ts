"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_ROUTES } from "@/app/routes";

export function useAuthGuard() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (!ready) return;
    if (authenticated) return;
    router.replace(APP_ROUTES.login);
  }, [authenticated, ready, router]);

  return {
    isAuthed: ready && authenticated,
    isChecking: !ready || !authenticated,
  };
}
