"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const secret = searchParams.get("secret");

  useEffect(() => {
    // Entry routing policy:
    // 1) External app handoff includes session params -> continue connect flow.
    // 2) Direct visits without a session -> go to download page until index/home ships.
    if (sessionId) {
      const qs = new URLSearchParams();
      qs.set("sessionId", sessionId);
      if (secret) qs.set("secret", secret);
      router.replace(`/connect?${qs.toString()}`);
      return;
    }
    router.replace("/download-data-connect");
  }, [router, sessionId, secret]);

  return null;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
