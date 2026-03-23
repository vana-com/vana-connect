"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeviceAuth } from "./use-device-auth";

const PENDING_DEVICE_CODE_KEY = "vana_pending_device_code";
const PENDING_APPROVAL_KEY = "vana_pending_device_approval";

function normalizeDeviceCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function formatDeviceCode(raw: string): string {
  const normalized = normalizeDeviceCode(raw);
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function readPendingCode(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.sessionStorage.getItem(PENDING_DEVICE_CODE_KEY) ?? "";
}

function writePendingCode(code: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (code) {
    window.sessionStorage.setItem(PENDING_DEVICE_CODE_KEY, code);
  } else {
    window.sessionStorage.removeItem(PENDING_DEVICE_CODE_KEY);
  }
}

function readPendingApproval(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(PENDING_APPROVAL_KEY) === "1";
}

function writePendingApproval(pending: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (pending) {
    window.sessionStorage.setItem(PENDING_APPROVAL_KEY, "1");
  } else {
    window.sessionStorage.removeItem(PENDING_APPROVAL_KEY);
  }
}

function DeviceAuthContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const initialPendingCode = useMemo(() => {
    const providedCode = normalizeDeviceCode(initialCode);
    if (providedCode) {
      return providedCode;
    }
    return normalizeDeviceCode(readPendingCode());
  }, [initialCode]);
  const [userCode, setUserCode] = useState(() =>
    formatDeviceCode(initialPendingCode),
  );
  const { isReady, isLoggedIn, status, error, approve, login } =
    useDeviceAuth();

  const normalizedUserCode = useMemo(
    () => normalizeDeviceCode(userCode),
    [userCode],
  );
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(
    null,
  );

  useEffect(() => {
    writePendingCode(normalizedUserCode);
  }, [normalizedUserCode]);

  useEffect(() => {
    if (status === "approved") {
      writePendingApproval(false);
      writePendingCode("");
    }
    if (status === "error") {
      setLastSubmittedCode(null);
    }
  }, [status]);

  const submitApproval = useCallback(
    (code: string) => {
      const normalized = normalizeDeviceCode(code);
      if (!normalized) {
        return;
      }
      if (lastSubmittedCode === normalized) {
        return;
      }

      setLastSubmittedCode(normalized);
      writePendingCode(normalized);
      approve(formatDeviceCode(normalized));
    },
    [approve, lastSubmittedCode],
  );

  useEffect(() => {
    if (!isReady || !isLoggedIn || status !== "idle") {
      return;
    }

    const pendingApproval = readPendingApproval();
    if (pendingApproval && normalizedUserCode.length === 8) {
      writePendingApproval(false);
      submitApproval(normalizedUserCode);
      return;
    }

    if (initialCode && normalizedUserCode.length === 8) {
      submitApproval(normalizedUserCode);
    }
  }, [
    initialCode,
    isLoggedIn,
    isReady,
    normalizedUserCode,
    status,
    submitApproval,
  ]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!normalizedUserCode) return;

      writePendingCode(normalizedUserCode);

      if (!isLoggedIn) {
        writePendingApproval(true);
        login();
        return;
      }

      submitApproval(normalizedUserCode);
    },
    [normalizedUserCode, isLoggedIn, login, submitApproval],
  );

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextCode = formatDeviceCode(e.target.value);
      if (normalizeDeviceCode(nextCode) !== lastSubmittedCode) {
        setLastSubmittedCode(null);
      }
      setUserCode(nextCode);
    },
    [lastSubmittedCode],
  );

  useEffect(() => {
    if (!isLoggedIn || status !== "idle" || normalizedUserCode.length !== 8) {
      return;
    }
    submitApproval(normalizedUserCode);
  }, [isLoggedIn, normalizedUserCode, status, submitApproval]);

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
              onChange={handleCodeChange}
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
                !normalizedUserCode ||
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

          <Text as="p" color="mutedForeground" intent="small">
            {isLoggedIn
              ? "Next you’ll confirm a free signature to approve this device."
              : "You’ll sign in first, then confirm a free signature to approve this device."}
          </Text>
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
