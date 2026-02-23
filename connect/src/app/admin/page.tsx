"use client";

import { BoxIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuthGuard } from "@/app/_auth/use-auth-guard";
import { PagePanel } from "@/app/_components/page-panel";
import { NavLink, PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { SingleFieldIconForm } from "@/components/elements/single-field-icon-form";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classes";
import { AdminFooterLinks } from "./_components/admin-footer-links";
import { RegisterAnotherAppButton } from "./_components/register-another-app-button";
import { saveRegisteredAdminApp } from "./_lib/admin-apps-storage";
import { resolveAdminPageUiDebugState } from "./admin-page.ui-debug";

type AdminState = "form" | "loading" | "result";

const DEFAULT_APP_URL = "";
const REGISTER_DELAY_MS = 900;
const SITE_METADATA_TIMEOUT_MS = 3500;

function randomPrivateKey(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `0x${hex}`;
}

export default function AdminPage() {
  const { isChecking } = useAuthGuard();
  const [state, setState] = useState<AdminState>("form");
  const [appUrl, setAppUrl] = useState(DEFAULT_APP_URL);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | "">("");
  const [copied, setCopied] = useState(false);

  // UI debug quick usage (dev only):
  // - /admin?adminDebug=1&adminScenario=form
  // - /admin?adminDebug=1&adminScenario=loading
  // - /admin?adminDebug=1&adminScenario=result
  // - No adminDebug/adminScenario => real state (no debug override).
  const ui = resolveAdminPageUiDebugState({
    state,
    appUrl,
    privateKey,
  });

  const envText = useMemo(() => {
    return `VANA_APP_PRIVATE_KEY=${ui.privateKey}\nAPP_URL=${ui.appUrl}`;
  }, [ui.appUrl, ui.privateKey]);

  if (isChecking) {
    return (
      <PageShell>
        <PagePanel>
          <PageLoadingState showVanaLogotype message="Checking session…" />
        </PagePanel>
      </PageShell>
    );
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = appUrl.trim();
    if (!trimmedUrl) {
      return;
    }

    setAppUrl(trimmedUrl);
    setCopied(false);
    setState("loading");

    await new Promise((resolve) => {
      window.setTimeout(resolve, REGISTER_DELAY_MS);
    });

    saveRegisteredAdminApp({
      id: crypto.randomUUID(),
      name: await resolveRegisteredAppName(trimmedUrl),
      url: trimmedUrl,
      createdAt: new Date().toISOString(),
    });

    setPrivateKey(randomPrivateKey());
    setState("result");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(envText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function resolveRegisteredAppName(url: string): Promise<string> {
    const metadataName = await readSiteMetadataName(url);
    if (metadataName) {
      return metadataName;
    }
    return resolveHostFallbackName(url);
  }

  async function readSiteMetadataName(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      SITE_METADATA_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        `/api/site-metadata?url=${encodeURIComponent(url)}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { name?: string | null };
      return typeof payload.name === "string" && payload.name.trim().length > 0
        ? payload.name.trim()
        : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function resolveHostFallbackName(url: string): string {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      const firstSegment = hostname.split(".")[0] ?? hostname;
      return firstSegment
        .split(/[-_]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
    } catch {
      return url;
    }
  }

  function handleReset() {
    setCopied(false);
    setAppUrl(DEFAULT_APP_URL);
    setPrivateKey("");
    setState("form");
  }

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel footer={<AdminFooterLinks />}>
        {ui.state !== "loading" && (
          <div className="absolute right-3 top-3">
            <NavLink
              href="/admin/apps"
              icon={<BoxIcon aria-hidden="true" />}
              className="bg-transparent"
            >
              Your apps
            </NavLink>
          </div>
        )}

        {ui.state === "loading" ? (
          <PageLoadingState message="Generating keys and registering with gateway…" />
        ) : ui.state !== "result" ? (
          <AdminFormState
            appUrl={ui.appUrl}
            isLoading={false}
            onAppUrlChange={setAppUrl}
            onSubmit={handleRegister}
          />
        ) : (
          <AdminResultState
            copied={copied}
            envText={envText}
            onCopy={handleCopy}
            onReset={handleReset}
          />
        )}
      </PagePanel>
    </PageShell>
  );
}

type AdminFormStateProps = {
  appUrl: string;
  isLoading: boolean;
  onAppUrlChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function AdminFormState({
  appUrl,
  isLoading,
  onAppUrlChange,
  onSubmit,
}: AdminFormStateProps) {
  return (
    <div className="space-y-small">
      <PageHeader
        showVanaLogotype
        heading="Register your app"
        color="iris"
        description={
          <Text>
            Register a new builder application with the Vana Gateway. You will
            receive credentials to integrate with the data portability network.
          </Text>
        }
      />

      <div className="space-y-gap -mx-1.5">
        <SingleFieldIconForm
          id="admin-app-url"
          name="app-url"
          type="url"
          placeholder="https://your-app.com"
          autoComplete="url"
          inputMode="url"
          required
          autoFocus
          value={appUrl}
          onChange={onAppUrlChange}
          onSubmit={onSubmit}
          isLoading={isLoading}
          submitAriaLabel="Register app"
        />

        {isLoading && (
          <Text intent="small" muted>
            Generating keys and registering with gateway…
          </Text>
        )}
      </div>
    </div>
  );
}

type AdminResultStateProps = {
  copied: boolean;
  envText: string;
  onCopy: () => Promise<void>;
  onReset: () => void;
};

function AdminResultState({
  copied,
  envText,
  onCopy,
  onReset,
}: AdminResultStateProps) {
  return (
    <div className="space-y-small flex-1 flex flex-col">
      <PageHeader
        showVanaLogotype
        heading="Your app is registered"
        color="iris"
        description={
          <Text>
            Add these values to your app&apos;s .env file. This private key is
            only shown once. Make sure to copy it before leaving this page.
          </Text>
        }
      />

      <div className="space-y-gap -mx-1.5">
        <div className="relative rounded-button bg-muted ring ring-border/70 overflow-hidden">
          {/* <div className="absolute top-1 right-1 z-10">
            <Button
              type="button"
              variant="default"
              size="xs"
              className={cn(
                "font-normal h-bar px-4!",
                // "rounded-none rounded-bl-button",
                copied ? "bg-foreground" : "bg-iris",
              )}
              onClick={onCopy}
              aria-live="polite"
            >
              {copied ? (
                <>
                  <CheckIcon />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon />
                  Copy env
                </>
              )}
            </Button>
          </div> */}
          <Text
            as="pre"
            intent="small"
            className="leading-[1.9] overflow-x-auto px-gap py-3.5"
          >
            {envText}
          </Text>
        </div>
        <Button
          type="button"
          variant="default"
          fullWidth
          size="sm"
          className={cn(
            // "font-normal",
            "h-tab",
            copied ? "bg-foreground" : "bg-iris",
          )}
          onClick={onCopy}
          aria-live="polite"
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied
            </>
          ) : (
            <>
              <CopyIcon />
              Copy env
            </>
          )}
        </Button>

        {/* <Text intent="small" color="mutedForeground">
          This private key is only shown once. Make sure to copy it before
          leaving this page.
        </Text> */}
      </div>

      <div className="mt-auto flex justify-end">
        <RegisterAnotherAppButton type="button" onClick={onReset}>
          Register another app
        </RegisterAnotherAppButton>
      </div>
    </div>
  );
}
