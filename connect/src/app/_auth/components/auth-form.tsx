import { CheckIcon, Loader2Icon } from "lucide-react";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { Text } from "@/components/typography/text";
import { CONNECT_CONFIG } from "@/config/config";
import { cn } from "@/lib/classes";
import { useAuthPage } from "../auth";
import { resolveAuthFormUiDebugState } from "./auth-form.ui-debug";
import { CodeVerificationForm } from "./code-verification-form";
import { EmailEntryForm } from "./email-entry-form";
import { SocialAuthButton } from "./social-auth-button";

/**
 * Privy docs reference:
 * https://docs.privy.io/recipes/core-js
 *
 * This is the auth window UI for the logic in `auth.ts`: it renders login,
 * loading, and success states while the Privy + Vana bootstrap flow runs.
 */

export const App = () => {
  const { privacyPolicyUrl, termsOfServiceUrl } = CONNECT_CONFIG.legal;
  const {
    view,
    loadingText,
    error,
    email,
    code,
    showCode,
    isSendingEmail,
    isVerifyingCode,
    isGoogleLoading,
    isAppleLoading,
    walletIframeUrl,
    walletIframeRef,
    handleWalletIframeLoad,
    handleEmailChange,
    handleCodeChange,
    handleEmailSubmit,
    handleVerifyCode,
    handleGoogleLogin,
    handleAppleLogin,
  } = useAuthPage();

  const ui = resolveAuthFormUiDebugState({
    view,
    loadingText,
    error,
    email,
    code,
    showCode,
    isSendingEmail,
    isVerifyingCode,
    isGoogleLoading,
    isAppleLoading,
  });

  const isEmailDisabled =
    ui.isSendingEmail || ui.isGoogleLoading || ui.isAppleLoading;
  const isVerifyDisabled =
    ui.isVerifyingCode || ui.isGoogleLoading || ui.isAppleLoading;

  return (
    <>
      <div
        className={cn(
          "container bg-background rounded-squish",
          "py-w8 px-w8",
          "min-h-[480px]",
          "ring-1 ring-input/20",
        )}
      >
        {/* LOADING */}
        {ui.view === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <Loader2Icon className="size-8 animate-spin text-accent" />
            <Text intent="small" color="mutedForeground">
              {ui.loadingText}
            </Text>
          </div>
        )}

        {/* SUCCESS */}
        {ui.view === "success" && (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success/20 text-success">
              <CheckIcon className="size-8" aria-hidden="true" />
            </div>
            <Text as="h2" intent="heading" weight="semi">
              Signed in.
            </Text>
            <Text intent="small" color="mutedForeground">
              You may now close this tab.
            </Text>
          </div>
        )}

        {/* LOGIN */}
        {ui.view === "login" && (
          <div className="space-y-small">
            <div className="space-y-gap">
              <VanaLogotype height={13} className="text-iris" />
              <Text as="h1" intent="title">
                <span className="text-iris">Sign in to Vana Passport</span>
                <br />
                to bring your data everywhere
              </Text>
              <Text as="p">
                Sign-in or create your Vana Passport to grant permissions.
              </Text>
              {ui.error && (
                <Text as="p" intent="small" color="destructive">
                  {ui.error}
                </Text>
              )}
            </div>

            <div className="space-y-3">
              {!ui.showCode && (
                <EmailEntryForm
                  email={ui.email}
                  isLoading={ui.isSendingEmail}
                  disabled={isEmailDisabled}
                  onEmailChange={handleEmailChange}
                  onSubmit={handleEmailSubmit}
                />
              )}
              {!ui.showCode && (
                <>
                  <SocialAuthButton
                    kind="google"
                    onClick={handleGoogleLogin}
                    isLoading={ui.isGoogleLoading}
                    disabled={ui.isGoogleLoading}
                  />
                  <SocialAuthButton
                    kind="apple"
                    onClick={handleAppleLogin}
                    isLoading={ui.isAppleLoading}
                    disabled={ui.isAppleLoading}
                  />
                </>
              )}
            </div>

            {ui.showCode && (
              <CodeVerificationForm
                code={ui.code}
                disabled={isVerifyDisabled}
                isVerifying={ui.isVerifyingCode}
                onCodeChange={handleCodeChange}
                onSubmit={handleVerifyCode}
              />
            )}

            <Text
              intent="small"
              muted
              align="center"
              className="mx-auto max-w-sm"
            >
              By creating an account, you agree to our
              <br />
              <a
                className="link hover:text-foreground"
                href={termsOfServiceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                className="link hover:text-foreground"
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
              .
            </Text>
          </div>
        )}
      </div>

      {/* Hidden embedded-wallet bridge iframe used for Privy wallet messaging/signing. */}
      {walletIframeUrl && (
        <iframe
          ref={walletIframeRef}
          title="Privy Wallet"
          src={walletIframeUrl}
          onLoad={handleWalletIframeLoad}
          className="hidden"
          data-privy-wallet="true"
        />
      )}
    </>
  );
};
