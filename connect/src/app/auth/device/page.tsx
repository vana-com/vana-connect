"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceAuth } from "./use-device-auth";

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [userCode, setUserCode] = useState(initialCode);
  const { isReady, isLoggedIn, status, error, approve, login } =
    useDeviceAuth();

  // Auto-approve if code was provided in URL and user is already logged in
  const [autoApproved, setAutoApproved] = useState(false);
  useEffect(() => {
    if (
      initialCode &&
      isReady &&
      isLoggedIn &&
      status === "idle" &&
      !autoApproved
    ) {
      setAutoApproved(true);
      approve(initialCode);
    }
  }, [initialCode, isReady, isLoggedIn, status, autoApproved, approve]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!userCode.trim()) return;

      if (!isLoggedIn) {
        login();
        return;
      }

      approve(userCode.trim());
    },
    [userCode, isLoggedIn, approve, login],
  );

  const formatCodeInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (value.length > 8) value = value.slice(0, 8);
      if (value.length > 4) {
        value = `${value.slice(0, 4)}-${value.slice(4)}`;
      }
      setUserCode(value);
    },
    [],
  );

  if (!isReady) {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Loading..." />
        </PagePanel>
      </PageShell>
    );
  }

  if (status === "approved") {
    return (
      <PageShell>
        <PagePanel>
          <div className="space-y-small">
            <PageHeader
              showVanaLogotype
              color="iris"
              heading="Device authorized"
              description={
                <Text>
                  You can close this window and return to your terminal.
                </Text>
              }
            />
          </div>
        </PagePanel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PagePanel>
        <div className="space-y-small">
          <PageHeader
            showVanaLogotype
            color="iris"
            heading="Authorize your device"
            description={
              <Text>
                Enter the code shown in your terminal to authorize this device.
              </Text>
            }
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="device-code"
              name="device-code"
              type="text"
              placeholder="XXXX-XXXX"
              value={userCode}
              onChange={formatCodeInput}
              autoComplete="off"
              autoFocus
              className="text-center text-lg tracking-widest font-mono"
              maxLength={9}
            />

            {error && (
              <Text as="p" color="destructive" aria-live="polite">
                {error}
              </Text>
            )}

            <Button
              type="submit"
              variant="iris"
              size="lg"
              fullWidth
              disabled={
                !userCode.trim() ||
                status === "signing" ||
                status === "approving"
              }
            >
              {!isLoggedIn ? (
                "Sign in to authorize"
              ) : status === "signing" ? (
                <>
                  <Spinner /> Signing...
                </>
              ) : status === "approving" ? (
                <>
                  <Spinner /> Authorizing...
                </>
              ) : (
                "Authorize device"
              )}
            </Button>
          </form>

          {!isLoggedIn && (
            <Text as="p" color="mutedForeground" intent="small">
              You need to sign in to your Vana account to authorize this device.
            </Text>
          )}
        </div>
      </PagePanel>
    </PageShell>
  );
}

export default function DeviceAuthPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PagePanel>
            <PageLoadingState showVanaLogotype message="Loading..." />
          </PagePanel>
        </PageShell>
      }
    >
      <DeviceAuthContent />
    </Suspense>
  );
}
