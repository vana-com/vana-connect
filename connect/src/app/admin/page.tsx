"use client";

import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GithubIcon,
  type LucideIcon,
  PlusIcon,
} from "lucide-react";
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
import { resolveAdminPageUiDebugState } from "./admin-page.ui-debug";

type AdminState = "form" | "loading" | "result";

const DEFAULT_APP_URL = "";
const DOCS_URL = "https://docs.vana.org";
const GITHUB_URL = "https://github.com/vana-com/vana-connect";
const REGISTER_DELAY_MS = 900;

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

  function handleReset() {
    setCopied(false);
    setAppUrl(DEFAULT_APP_URL);
    setPrivateKey("");
    setState("form");
  }

  return (
    <PageShell showBackButton={false} showLogoutButton showYourAppsButton>
      <div className="w-full space-y-gap">
        <PagePanel>
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

        <div className="flex items-center justify-center gap-5">
          <FooterExternalLink href={GITHUB_URL} icon={GithubIcon}>
            GitHub
          </FooterExternalLink>
          <FooterExternalLink href={DOCS_URL} icon={BookOpenTextIcon}>
            Documentation
          </FooterExternalLink>
        </div>
      </div>
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
          <div className="absolute top-1 right-1 z-10">
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
          </div>
          <Text
            as="pre"
            intent="small"
            className="leading-[1.9] overflow-x-auto px-gap py-4"
          >
            {envText}
          </Text>
        </div>

        {/* <Text intent="small" color="mutedForeground">
          This private key is only shown once. Make sure to copy it before
          leaving this page.
        </Text> */}
      </div>

      <div className="mt-auto flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReset}
          className="text-foreground-muted hover:text-foreground"
        >
          <div className="rounded-full border p-0.5 text-current group-hover:border-ring">
            <PlusIcon className="size-em" />
          </div>
          Register another app
        </Button>
      </div>
    </div>
  );
}

type FooterExternalLinkProps = {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
};

function FooterExternalLink({
  href,
  icon: Icon,
  children,
}: FooterExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-small text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-4" aria-hidden />
      {children}
      <ExternalLinkIcon className="size-3.5" aria-hidden />
    </a>
  );
}
