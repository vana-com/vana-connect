"use client";

import {
  CopyIcon,
  InfoIcon,
  PlayIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import {
  PageHeader,
  PageLoadingState,
} from "@/components/elements/page-header";
import { LoadingButton } from "@/components/elements/button-loading";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/app/_auth/use-auth-guard";
import { cn } from "@/lib/classes";
import { useServer, type ServerStatus } from "./use-server";

export default function ServerPage() {
  const { isAuthed, isChecking } = useAuthGuard();

  if (isChecking) {
    return (
      <PageShell actions={["logout"]}>
        <PagePanel>
          <PageLoadingState message="Checking authentication..." />
        </PagePanel>
      </PageShell>
    );
  }

  if (!isAuthed) return null;

  return <ServerPageContent />;
}

function ServerPageContent() {
  const {
    server,
    status,
    error,
    walletAddress,
    provision,
    deprovision,
    refresh,
  } = useServer();

  if (status === "loading") {
    return (
      <PageShell actions={["dataConnect", "logout"]}>
        <PagePanel>
          <PageLoadingState message="Loading server status..." />
        </PagePanel>
      </PageShell>
    );
  }

  if (status === "idle") {
    return (
      <PageShell actions={["dataConnect", "logout"]}>
        <PagePanel>
          <div className="space-y-8">
            <PageHeader
              heading="Personal Server"
              description={
                <Text as="p" intent="body" dim>
                  Get your own cloud Personal Server
                </Text>
              }
            />
            <ServerCard>
              <div className="flex flex-col items-center gap-5 py-4">
                <Text as="p" intent="body" dim align="center">
                  Your server will be available at{" "}
                  <Text as="span" intent="body" mono>
                    {walletAddress
                      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}.myvana.app`
                      : "your-wallet.myvana.app"}
                  </Text>
                </Text>
                <LoadingButton
                  variant="iris"
                  size="lg"
                  onClick={() => void provision()}
                >
                  <ServerIcon aria-hidden />
                  Provision Server
                </LoadingButton>
              </div>
            </ServerCard>
          </div>
        </PagePanel>
      </PageShell>
    );
  }

  const statusInfo = getStatusInfo(status);

  return (
    <PageShell actions={["dataConnect", "logout"]}>
      <PagePanel>
        <div className="space-y-8">
          <PageHeader
            heading="Personal Server"
            description={
              <Text as="p" intent="body" dim>
                Your cloud Personal Server
              </Text>
            }
          />

          {/* Control section */}
          <ServerSection title="Control">
            <ServerCard>
              <DetailRow
                label={
                  <div className="flex items-baseline gap-1.75">
                    <span className="font-semibold">Status</span>
                    <StatusIndicator
                      tone={statusInfo.tone}
                      pulse={status === "provisioning"}
                    >
                      {statusInfo.label}
                    </StatusIndicator>
                  </div>
                }
                value={
                  status === "error" || status === "stopped" ? (
                    <LoadingButton
                      variant="ghost"
                      size="sm"
                      onClick={() => void refresh()}
                    >
                      <PlayIcon aria-hidden />
                      Retry
                    </LoadingButton>
                  ) : null
                }
              />
            </ServerCard>
          </ServerSection>

          {/* Runtime section */}
          <ServerSection title="Runtime">
            <ServerCard>
              <DetailRow
                label="Public endpoint"
                value={
                  <CopyableValue
                    value={server?.url ?? null}
                    emptyLabel={getEndpointEmptyLabel(status)}
                    copyLabel="Copy URL"
                  />
                }
              />
              <DetailRow
                hasTopRule
                label={
                  <div className="flex items-center gap-1.5">
                    <span>MCP endpoint</span>
                    <McpInfoBadge />
                  </div>
                }
                value={
                  <CopyableValue
                    value={server?.mcp_endpoint ?? null}
                    emptyLabel="Available once endpoint is live"
                    copyLabel="Copy MCP endpoint"
                  />
                }
              />
            </ServerCard>
          </ServerSection>

          {/* Error detail */}
          {error && (
            <ServerCard>
              <div className="px-4 py-3">
                <Text as="p" intent="small" color="destructive">
                  {error}
                </Text>
              </div>
            </ServerCard>
          )}

          {/* Deprovision */}
          {server && status !== "provisioning" && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void deprovision()}
                className="text-destructive-foreground hover:text-destructive-foreground"
              >
                <Trash2Icon aria-hidden />
                Remove Server
              </Button>
            </div>
          )}
        </div>
      </PagePanel>
    </PageShell>
  );
}

// --- Local layout components (matching data-connect settings patterns) ---

function ServerSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <Text as="h2" intent="button" weight="medium">
        {title}
      </Text>
      {children}
    </section>
  );
}

function ServerCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card ring ring-input/20 bg-background">
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  hasTopRule = false,
}: {
  label: ReactNode;
  value: ReactNode;
  hasTopRule?: boolean;
}) {
  const labelContent =
    typeof label === "string" ? (
      <Text as="div" intent="body" weight="semi">
        {label}
      </Text>
    ) : (
      label
    );

  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-4 px-4 py-4",
      )}
    >
      {hasTopRule && (
        <div className="absolute top-0 inset-x-0 px-4">
          <hr className="border-input/20" />
        </div>
      )}
      <div className="shrink-0 flex items-center gap-1.5">{labelContent}</div>
      <div className="min-w-0 flex flex-1 justify-end">{value}</div>
    </div>
  );
}

// --- Status indicator ---

type StatusTone = "success" | "accent" | "warning" | "destructive" | "muted";

const toneStyles: Record<
  StatusTone,
  { textClassName: string; dotClassName: string }
> = {
  success: {
    textClassName: "text-success-foreground",
    dotClassName: "bg-success-foreground",
  },
  accent: {
    textClassName: "text-accent",
    dotClassName: "bg-accent",
  },
  warning: {
    textClassName: "text-warning",
    dotClassName: "bg-warning",
  },
  destructive: {
    textClassName: "text-destructive-foreground",
    dotClassName: "bg-destructive-foreground",
  },
  muted: {
    textClassName: "text-muted-foreground",
    dotClassName: "bg-muted-foreground/70",
  },
};

function StatusIndicator({
  tone,
  pulse = false,
  children,
}: {
  tone: StatusTone;
  pulse?: boolean;
  children: ReactNode;
}) {
  const style = toneStyles[tone];
  return (
    <Text
      as="div"
      intent="body"
      withIcon
      className={cn("gap-1.5", style.textClassName)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-[0.5em] rounded-full",
          style.dotClassName,
          pulse && "animate-pulse",
        )}
      />
      {children}
    </Text>
  );
}

function getStatusInfo(status: ServerStatus): {
  tone: StatusTone;
  label: string;
} {
  switch (status) {
    case "running":
      return { tone: "success", label: "Running" };
    case "provisioning":
      return { tone: "accent", label: "Provisioning..." };
    case "stopped":
      return { tone: "warning", label: "Stopped" };
    case "error":
      return { tone: "destructive", label: "Error" };
    default:
      return { tone: "muted", label: status };
  }
}

function getEndpointEmptyLabel(status: ServerStatus): string {
  if (status === "provisioning") return "Generating...";
  if (status === "stopped") return "Server is stopped. Endpoint unavailable.";
  if (status === "error")
    return "Server failed to start. Retry to regenerate endpoint.";
  return "Not available yet.";
}

// --- Copyable value ---

function CopyableValue({
  value,
  emptyLabel,
  copyLabel,
}: {
  value: string | null;
  emptyLabel: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // silent
    }
  }, [value]);

  if (!value) {
    return (
      <Text as="span" intent="small" dim>
        {emptyLabel}
      </Text>
    );
  }

  return (
    <div className="relative min-w-0">
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute -top-9 right-0 z-50 overflow-hidden",
            "px-2 py-1 rounded-button text-xs",
            "bg-foreground text-muted",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          Copied to clipboard
        </div>
      )}
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          "group",
          "inline-flex min-w-0 items-center gap-1.5",
          "rounded-button py-1 pl-2 pr-1 -mr-1",
          "text-foreground-dim",
          "hover:bg-foreground/3 hover:text-foreground",
        )}
      >
        <span className="shrink-0">
          <CopyIcon
            aria-hidden="true"
            className="size-[0.9em] text-small group-hover:text-foreground"
          />
        </span>
        <span className="sr-only">{copied ? "Copied" : copyLabel}</span>
        <Text
          as="span"
          intent="small"
          dim
          truncate
          className="inline-block max-w-[18ch] sm:max-w-[24ch] group-hover:text-foreground"
          title={value}
        >
          {value}
        </Text>
      </button>
    </div>
  );
}

// --- MCP info badge (simple title, no tooltip component needed) ---

function McpInfoBadge() {
  return (
    <span
      title="Use this in Claude Desktop or another MCP client as your custom MCP server URL. It connects to your Personal Server."
      className="inline-flex size-3.5 items-center justify-center text-foreground-muted hover:text-foreground cursor-help"
    >
      <InfoIcon aria-hidden="true" className="size-3.5" />
    </span>
  );
}
