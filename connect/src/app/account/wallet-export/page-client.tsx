"use client";

import {
  useCreateWallet,
  useExportWallet,
  useGetWalletPrivateKey,
  useModalStatus,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { ExternalLinkIcon, KeyRoundIcon, LockKeyholeIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { LoadingButton } from "@/components/elements/button-loading";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";

type ExportStatus =
  | { kind: "idle" }
  | { kind: "running"; action: "modal" | "silent" | "create" }
  | { kind: "success"; message: string }
  | {
      kind: "silent-success";
      chainType: string;
      ciphertextLength: number;
      encapsulatedKeyLength: number;
      modalOpened: boolean;
    }
  | { kind: "error"; message: string };

type EmbeddedWallet = {
  address: string;
  walletClientType?: string;
  chainType?: string;
};

export function WalletExportPageClient() {
  const { ready, authenticated, login, user } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const { getWalletPrivateKey } = useGetWalletPrivateKey();
  const { isOpen: isPrivyModalOpen } = useModalStatus();
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  const modalOpenedDuringSilentProbeRef = useRef(false);

  const embeddedWallets = useMemo<EmbeddedWallet[]>(() => {
    const accounts: unknown[] = user?.linkedAccounts ?? [];
    return accounts.filter(isPrivyEmbeddedEvmWallet);
  }, [user?.linkedAccounts]);
  const selectedWallet = embeddedWallets[0] ?? null;
  const isBusy = status.kind === "running";
  const isReady = ready && walletsReady;

  useEffect(() => {
    if (
      status.kind === "running" &&
      status.action === "silent" &&
      isPrivyModalOpen
    ) {
      modalOpenedDuringSilentProbeRef.current = true;
    }
  }, [isPrivyModalOpen, status]);

  async function createEmbeddedWallet() {
    setStatus({ kind: "running", action: "create" });
    try {
      await createWallet();
      setStatus({
        kind: "success",
        message: "Privy created an embedded EVM wallet for this account.",
      });
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    }
  }

  async function openUserExportModal() {
    if (!selectedWallet) return;
    setStatus({ kind: "running", action: "modal" });
    try {
      await exportWallet({ address: selectedWallet.address });
      setStatus({
        kind: "success",
        message:
          "Privy closed the export modal. This app did not receive the private key.",
      });
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    }
  }

  async function runSilentEncryptedExportProbe() {
    if (!selectedWallet) return;
    modalOpenedDuringSilentProbeRef.current = false;
    setStatus({ kind: "running", action: "silent" });
    try {
      const recipientPublicKey = await generateP256SpkiPublicKeyBase64();
      const encrypted = await getWalletPrivateKey({
        address: selectedWallet.address,
        recipientPublicKey,
      });
      setStatus({
        kind: "silent-success",
        chainType: encrypted.chainType,
        ciphertextLength: encrypted.ciphertext.length,
        encapsulatedKeyLength: encrypted.encapsulatedKey.length,
        modalOpened: modalOpenedDuringSilentProbeRef.current,
      });
    } catch (error) {
      setStatus({ kind: "error", message: getErrorMessage(error) });
    }
  }

  return (
    <PageShell actions={authenticated ? ["access", "logout"] : []}>
      <PagePanel className="max-w-[780px]">
        <div className="space-y-8">
          <PageHeader
            showVanaLogotype
            heading="Privy key export proof"
            description={
              <Text as="p" intent="body" color="foregroundDim">
                Minimal account page for testing how Privy lets a signed-in user
                export an embedded wallet key.
              </Text>
            }
          />

          <Section title="What this tests">
            <div className="space-y-3">
              <Text as="p" intent="small" color="foregroundDim">
                Privy documents the normal React path as{" "}
                <Text as="span" intent="small" mono>
                  exportWallet()
                </Text>
                : it opens a Privy modal where the user can copy the key. Privy
                also states that client-created wallets can only use that React
                SDK export path.
              </Text>
              <Text as="p" intent="small" color="foregroundDim">
                The second button probes the SDK's encrypted export hook. If it
                returns ciphertext without opening a Privy modal, this wallet
                type supports app-triggered encrypted export after the user is
                already signed in. If it fails, the error text tells us which
                wallet type or policy blocks it.
              </Text>
            </div>
          </Section>

          <Section title="Current account">
            {!isReady ? (
              <Text intent="small" color="foregroundDim">
                Checking Privy session...
              </Text>
            ) : !authenticated ? (
              <div className="space-y-4">
                <Text intent="small" color="foregroundDim">
                  Sign in before testing key export.
                </Text>
                <Button type="button" onClick={() => login()}>
                  Sign in with Privy
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Detail label="Privy user" value={user?.id ?? "Unknown"} />
                <Detail
                  label="Embedded EVM wallet"
                  value={selectedWallet?.address ?? "None found"}
                />
                {selectedWallet ? (
                  <Text intent="fine" color="mutedForeground">
                    Wallet client: {selectedWallet.walletClientType ?? "privy"}
                  </Text>
                ) : (
                  <LoadingButton
                    type="button"
                    variant="outline"
                    isLoading={isBusy && status.action === "create"}
                    onClick={() => void createEmbeddedWallet()}
                  >
                    Create embedded wallet
                  </LoadingButton>
                )}
              </div>
            )}
          </Section>

          <Section title="Export actions">
            <div className="grid gap-3 sm:grid-cols-2">
              <LoadingButton
                type="button"
                variant="iris"
                disabled={!selectedWallet || isBusy}
                isLoading={isBusy && status.action === "modal"}
                onClick={() => void openUserExportModal()}
              >
                <KeyRoundIcon aria-hidden="true" />
                Open Privy export modal
              </LoadingButton>
              <LoadingButton
                type="button"
                variant="outline"
                disabled={!selectedWallet || isBusy}
                isLoading={isBusy && status.action === "silent"}
                onClick={() => void runSilentEncryptedExportProbe()}
              >
                <LockKeyholeIcon aria-hidden="true" />
                Probe silent encrypted export
              </LoadingButton>
            </div>
            <Text as="p" intent="fine" color="mutedForeground">
              This page never renders a raw private key. The modal path is
              user-visible; the probe path records whether Privy returned an
              encrypted key payload.
            </Text>
          </Section>

          <ResultPanel status={status} />

          <Section title="Source">
            <a
              className="inline-flex items-center gap-1.5 text-small font-medium underline underline-offset-4"
              href="https://docs.privy.io/wallets/wallets/export"
              rel="noreferrer"
              target="_blank"
            >
              Privy export wallet docs
              <ExternalLinkIcon aria-hidden="true" className="size-em" />
            </a>
          </Section>
        </div>
      </PagePanel>
    </PageShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <Text as="h2" intent="small" weight="semi">
        {title}
      </Text>
      <div className="rounded-squish border border-input/30 bg-canvas p-4">
        {children}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_1fr]">
      <Text intent="fine" color="mutedForeground">
        {label}
      </Text>
      <Text intent="fine" mono className="break-all">
        {value}
      </Text>
    </div>
  );
}

function ResultPanel({ status }: { status: ExportStatus }) {
  if (status.kind === "idle") return null;

  if (status.kind === "running") {
    return (
      <StatusBox tone="neutral">
        {status.action === "modal"
          ? "Waiting for the Privy export modal to close..."
          : status.action === "silent"
            ? "Requesting encrypted export from Privy..."
            : "Creating embedded wallet..."}
      </StatusBox>
    );
  }

  if (status.kind === "silent-success") {
    return (
      <StatusBox tone={status.modalOpened ? "warning" : "success"}>
        <div className="space-y-2">
          <Text as="p" intent="small" weight="semi">
            Encrypted export returned.
          </Text>
          <div className="grid gap-1">
            <Detail label="Chain type" value={status.chainType} />
            <Detail
              label="Ciphertext length"
              value={String(status.ciphertextLength)}
            />
            <Detail
              label="Encapsulated key length"
              value={String(status.encapsulatedKeyLength)}
            />
            <Detail
              label="Privy modal opened"
              value={status.modalOpened ? "yes" : "no"}
            />
          </div>
        </div>
      </StatusBox>
    );
  }

  return (
    <StatusBox tone={status.kind === "error" ? "error" : "success"}>
      {status.message}
    </StatusBox>
  );
}

function StatusBox({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  const toneClassName = {
    neutral: "border-input/30 bg-canvas text-foreground",
    success: "border-success-foreground/30 bg-success/10 text-foreground",
    warning: "border-accent/30 bg-accent/10 text-foreground",
    error: "border-destructive-foreground/30 bg-destructive/10 text-foreground",
  }[tone];

  return (
    <div className={`rounded-squish border p-4 text-small ${toneClassName}`}>
      {children}
    </div>
  );
}

function isPrivyEmbeddedEvmWallet(account: unknown): account is EmbeddedWallet {
  if (!account || typeof account !== "object") return false;
  const record = account as Record<string, unknown>;
  return (
    record.type === "wallet" &&
    record.chainType === "ethereum" &&
    typeof record.address === "string" &&
    (record.walletClientType === "privy" ||
      record.walletClientType === "privy-v2")
  );
}

async function generateP256SpkiPublicKeyBase64() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  return arrayBufferToBase64(spki);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Privy export request failed.";
}
