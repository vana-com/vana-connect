"use client";

import { ArrowRightIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { Spinner } from "@/components/elements/spinner";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { fieldVariants, stateFocusWithin } from "@/components/typography/field";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <PageShell showBackButton={false} showLogoutButton showYourAppsButton>
      <PagePanel footer={<AdminFooterLinks />}>
        {ui.state !== "result" ? (
          <AdminFormState
            appUrl={ui.appUrl}
            isLoading={ui.state === "loading"}
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
      <div className="space-y-5">
        <div className="space-y-2.5">
          <VanaLogotype height={13} className="text-iris" />
          <Text as="h1" intent="title" color="iris" className="-ml-px">
            Register your app
          </Text>
        </div>
        <Text>
          Register a new builder application with the Vana Gateway. You will
          receive credentials to integrate with the data portability network.
        </Text>
      </div>

      <div className="space-y-gap -mx-1.5">
        <form
          onSubmit={onSubmit}
          className={cn(
            fieldVariants({ variant: "outline", size: "lg" }),
            "group items-center justify-start gap-3 pl-0 pr-[5px]",
            stateFocusWithin,
            "focus-within:border-iris focus-within:ring-iris/10",
          )}
          aria-busy={isLoading}
        >
          <label
            htmlFor="admin-app-url"
            className="peer flex h-full w-full min-w-0 flex-1 items-center gap-0"
          >
            <Input
              id="admin-app-url"
              name="app-url"
              type="url"
              autoFocus
              autoComplete="url"
              spellCheck={false}
              value={appUrl}
              onChange={(event) => onAppUrlChange(event.target.value)}
              placeholder="https://your-app.com"
              className="border-0 bg-transparent px-gap focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100"
              inputMode="url"
              required
              disabled={isLoading}
            />
          </label>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="disabled:opacity-100 peer-focus-within:text-iris hover:text-iris"
            aria-label="Register app"
            disabled={isLoading}
          >
            {isLoading ? <Spinner boxSize={18} /> : <ArrowRightIcon />}
          </Button>
        </form>

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
      <div className="space-y-5">
        <div className="space-y-2.5">
          <VanaLogotype height={13} className="text-iris" />
          <Text as="h1" intent="title" color="iris" className="-ml-px">
            Your app is registered
          </Text>
        </div>
        <Text as="p">
          Add these values to your app&apos;s .env file. This private key is
          only shown once. Make sure to copy it before leaving this page.
        </Text>
      </div>

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
