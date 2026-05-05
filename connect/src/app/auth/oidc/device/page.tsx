"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";

/**
 * Hydra device-grant verification page.
 *
 * Hydra (RFC 8628) redirects users here from `/oauth2/device/verify` with
 * `?device_challenge=…&user_code=…`. We:
 *
 *   1. Display the user_code so the user can confirm it matches what their
 *      device shows. Hydra has already validated that the code exists.
 *   2. Require an explicit "Authorize" click. Per RFC 8628 §5.2 the device
 *      grant requires user interaction; never auto-accept.
 *   3. Sign the user in via Privy/Vana session if needed before showing the
 *      authorize control.
 *
 * On Authorize, POST to `/api/auth/oidc/device-accept`. The response is
 * `{ redirect_to }` (Hydra's URL — typically re-enters `/oauth2/auth` for
 * login + consent under the device session). We navigate the browser there;
 * after the consent flow completes, Hydra redirects to
 * `urls.device.success` → `/auth/oidc/device-success`.
 */

function readVanaAccessCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== "vana_access") continue;
    const v = part.slice(eq + 1).trim();
    return v ? decodeURIComponent(v) : null;
  }
  return null;
}

type AcceptStatus = "idle" | "submitting" | "approved" | "error";

function DeviceVerificationContent() {
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();

  const deviceChallenge = searchParams.get("device_challenge");
  const userCode = searchParams.get("user_code");

  const [status, setStatus] = useState<AcceptStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = ready && authenticated;

  const formattedUserCode = useMemo(() => {
    if (!userCode) return "";
    const upper = userCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (upper.length === 8) return `${upper.slice(0, 4)}-${upper.slice(4)}`;
    return upper;
  }, [userCode]);

  const handleSignIn = useCallback(() => {
    // Send the user through `/login` so it can bootstrap the Vana session
    // cookie (`vana_access`) we need on the Authorize POST. `usePrivy().login()`
    // alone would only authenticate at the Privy layer; the cookie set by
    // /api/auth/session would still be missing. Preserve the device params via
    // return_to so the user lands back here ready to Authorize.
    if (!deviceChallenge || !userCode) return;
    const here =
      `/auth/oidc/device?device_challenge=${encodeURIComponent(deviceChallenge)}` +
      `&user_code=${encodeURIComponent(userCode)}`;
    window.location.href = `/login?return_to=${encodeURIComponent(here)}`;
  }, [deviceChallenge, userCode]);

  const handleAuthorize = useCallback(async () => {
    if (!deviceChallenge || !userCode) return;
    setStatus("submitting");
    setError(null);
    try {
      const accessToken = readVanaAccessCookie();
      if (!accessToken) {
        // Vana session bootstrap hasn't completed yet (Privy is signed in but
        // the BFF hasn't issued vana_access). Drive the bootstrap by hitting
        // /api/auth/session — but the page's normal Privy flow already does
        // that on mount; if we're here without it, surface the gap.
        throw new Error("Vana session not ready yet — refresh and try again.");
      }
      const res = await fetch("/api/auth/oidc/device-accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          device_challenge: deviceChallenge,
          user_code: userCode,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Authorize failed: ${res.status}`);
      }
      const json = (await res.json()) as { redirect_to?: string };
      if (!json.redirect_to) {
        throw new Error("Server response missing redirect_to");
      }
      setStatus("approved");
      // Navigate the browser into Hydra's continuation URL; Hydra will
      // typically re-enter the OAuth authorize endpoint under our domain
      // before landing at urls.device.success.
      window.location.href = json.redirect_to;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [deviceChallenge, userCode]);

  // If both params absent, this page was hit incorrectly — show a clear
  // error rather than a blank screen.
  useEffect(() => {
    if (!deviceChallenge || !userCode) {
      setError(
        "This page is reached from a Hydra device-grant redirect; required parameters are missing.",
      );
    }
  }, [deviceChallenge, userCode]);

  if (!deviceChallenge || !userCode) {
    return (
      <PageShell>
        <PagePanel>
          <PageHeader
            showVanaLogotype
            color="iris"
            heading="Cannot authorize device"
            description={<Text>{error ?? "Missing device parameters."}</Text>}
          />
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
            heading="Authorize this device"
            description={
              <Text>
                A device is requesting access to your Vana account. Confirm the
                code below matches the one shown on the device, then authorize.
              </Text>
            }
          />

          <div className="rounded-lg bg-muted p-4 text-center">
            <Text
              as="p"
              intent="small"
              color="mutedForeground"
              className="mb-1"
            >
              Code on your device
            </Text>
            <Text
              as="p"
              className="text-2xl tracking-widest font-mono"
              data-testid="device-user-code"
            >
              {formattedUserCode}
            </Text>
          </div>

          {error && (
            <Text as="p" color="destructive" aria-live="polite">
              {error}
            </Text>
          )}

          {!isLoggedIn ? (
            <Button
              type="button"
              variant="iris"
              size="lg"
              fullWidth
              onClick={handleSignIn}
              disabled={!ready}
            >
              {!ready ? <Spinner /> : "Sign in to authorize"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="iris"
              size="lg"
              fullWidth
              onClick={handleAuthorize}
              disabled={status === "submitting" || status === "approved"}
            >
              {status === "submitting" ? (
                <>
                  <Spinner /> Authorizing...
                </>
              ) : status === "approved" ? (
                "Authorized"
              ) : (
                "Authorize device"
              )}
            </Button>
          )}

          <Text as="p" color="mutedForeground" intent="small">
            Only authorize devices you started. You can revoke access later from
            your account settings.
          </Text>
        </div>
      </PagePanel>
    </PageShell>
  );
}

export default function DeviceVerificationPage() {
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
      <DeviceVerificationContent />
    </Suspense>
  );
}
