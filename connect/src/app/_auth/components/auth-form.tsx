import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { PagePanel } from "@/app/_components/page-panel";
import { Spinner } from "@/components/elements/spinner";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { Text } from "@/components/typography/text";
import { CONNECT_CONFIG } from "@/config/config";
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
    grantsUrl,
    isDesktopHandoff,
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
      <PagePanel>
        {/* LOADING */}
        {ui.view === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Spinner boxSize={32} className="text-iris" />
            <Text intent="small" color="mutedForeground">
              {ui.loadingText}
            </Text>
          </div>
        )}

        {/* SUCCESS */}
        {ui.view === "success" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <div className="flex items-center justify-center text-iris">
              <CheckIcon className="size-12" aria-hidden="true" />
            </div>
            <Text as="h2" intent="title" color="iris">
              Signed in.
            </Text>
            <Text dim className="pt-2">
              {isDesktopHandoff
                ? "Return to the Data Connect app."
                : "Redirecting you to your data permissions…"}
            </Text>
            <Text dim>
              {isDesktopHandoff ? (
                "You may close this tab."
              ) : (
                <>
                  Didn't work?{" "}
                  <Link className="link hover:text-foreground" href={grantsUrl}>
                    Click here
                  </Link>
                  .
                </>
              )}
            </Text>
          </div>
        )}

        {/* LOGIN */}
        {ui.view === "login" && (
          <div className="space-y-small">
            <div className="space-y-w6">
              <div className="space-y-2.5">
                <VanaLogotype height={13} className="text-iris" />
                <Text as="h1" intent="title">
                  <span className="text-iris">Sign in to Vana Passport</span>
                  <br />
                  to bring your data everywhere
                </Text>
              </div>
              <Text as="p">
                Sign-in or create your Vana Passport to grant data permissions.
              </Text>
              {ui.error && (
                <Text
                  as="p"
                  intent="small"
                  color="destructive"
                  className="pt-2"
                >
                  {ui.error}
                </Text>
              )}
            </div>

            {!ui.showCode && (
              <div className="space-y-3">
                <EmailEntryForm
                  email={ui.email}
                  isLoading={ui.isSendingEmail}
                  disabled={isEmailDisabled}
                  onEmailChange={handleEmailChange}
                  onSubmit={handleEmailSubmit}
                />
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
              </div>
            )}

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
      </PagePanel>

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
