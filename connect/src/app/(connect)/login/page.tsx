"use client";

import { Suspense, useId, useState } from "react";
import { CodeVerificationForm } from "@/app/_auth/components/code-verification-form";
import { EmailEntryForm } from "@/app/_auth/components/email-entry-form";
import { SocialAuthButton } from "@/app/_auth/components/social-auth-button";
import { LegalAcceptance } from "@/app/_components/legal-acceptance";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { Spinner } from "@/components/elements/spinner";
import { VanaLogotype } from "@/components/icons/vana-logotype";
import { Text } from "@/components/typography/text";
import { CONNECT_CONFIG } from "@/config/config";
import { useLoginPage } from "./use-login-page";

function LoginPageContent() {
  const { privacyPolicyUrl, termsOfServiceUrl } = CONNECT_CONFIG.legal;
  const checkboxId = useId();
  const [isPassportAgreementAccepted, setIsPassportAgreementAccepted] =
    useState(false);
  const {
    view,
    error,
    email,
    code,
    isSendingEmail,
    isVerifyingCode,
    isGoogleLoading,
    isAppleLoading,
    handleEmailChange,
    handleCodeChange,
    handleEmailSubmit,
    handleCodeSubmit,
    handleGoogleLogin,
    handleAppleLogin,
    recordPassportAgreementAcceptance,
  } = useLoginPage();

  const isEmailDisabled =
    isSendingEmail ||
    isGoogleLoading ||
    isAppleLoading ||
    !isPassportAgreementAccepted;
  const isVerifyDisabled = isVerifyingCode || isGoogleLoading || isAppleLoading;
  const isGoogleDisabled = isGoogleLoading || !isPassportAgreementAccepted;
  const isAppleDisabled = isAppleLoading || !isPassportAgreementAccepted;

  async function handleEmailSubmitWithPassportAgreement() {
    if (!isPassportAgreementAccepted) return;
    recordPassportAgreementAcceptance();
    await handleEmailSubmit();
  }

  function handleGoogleLoginWithPassportAgreement() {
    if (!isPassportAgreementAccepted) return;
    recordPassportAgreementAcceptance();
    handleGoogleLogin();
  }

  function handleAppleLoginWithPassportAgreement() {
    if (!isPassportAgreementAccepted) return;
    recordPassportAgreementAcceptance();
    handleAppleLogin();
  }

  return (
    <PageShell showBackButton={false}>
      <PagePanel>
        {/* Loading / Completing */}
        {(view === "loading" || view === "completing") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Spinner boxSize={32} className="text-iris" />
            <Text intent="small" color="mutedForeground">
              {view === "completing" ? "Signing you in..." : "Preparing..."}
            </Text>
          </div>
        )}

        {/* Email entry */}
        {view === "email" && (
          <div className="space-y-small">
            <div className="space-y-5">
              <div className="space-y-2.5">
                <VanaLogotype height={13} className="text-iris" />
                <Text as="h1" intent="title">
                  <span className="text-iris">Sign in to Vana</span>
                  <br />
                  to connect your data
                </Text>
              </div>
              <Text as="p">
                Sign in to authorize Data Connect and bring your data
                everywhere.
              </Text>
              {error && (
                <Text
                  as="p"
                  intent="small"
                  color="destructive"
                  className="pt-2"
                >
                  {error}
                </Text>
              )}
            </div>

            <div className="space-y-3">
              <EmailEntryForm
                email={email}
                isLoading={isSendingEmail}
                disabled={isEmailDisabled}
                onEmailChange={handleEmailChange}
                onSubmit={handleEmailSubmitWithPassportAgreement}
              />
              <SocialAuthButton
                kind="google"
                onClick={handleGoogleLoginWithPassportAgreement}
                isLoading={isGoogleLoading}
                disabled={isGoogleDisabled}
              />
              <SocialAuthButton
                kind="apple"
                onClick={handleAppleLoginWithPassportAgreement}
                isLoading={isAppleLoading}
                disabled={isAppleDisabled}
              />
            </div>

            <LegalAcceptance
              checkboxId={checkboxId}
              checked={isPassportAgreementAccepted}
              onCheckedChange={setIsPassportAgreementAccepted}
              label="I have read and agree to the Vana Terms of Service and Privacy Policy."
              detailsIntent="fine"
              details={
                <>
                  By creating a Vana Passport, you agree to the{" "}
                  <a
                    className="link hover:text-foreground"
                    href={termsOfServiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Vana Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    className="link hover:text-foreground"
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Vana Privacy Policy
                  </a>
                  . These documents govern how information you provide in
                  connection with your Passport may be processed for the
                  purposes of enabling protocol identity, authentication,
                  permissioning your data, and your use of applications or
                  services that interact with the Vana protocol.
                </>
              }
            />
          </div>
        )}

        {/* Code verification */}
        {view === "code" && (
          <div className="space-y-small">
            <div className="space-y-w6">
              <div className="space-y-2.5">
                <VanaLogotype height={13} className="text-iris" />
                <Text as="h1" intent="title">
                  Check your email
                </Text>
              </div>
              {error && (
                <Text
                  as="p"
                  intent="small"
                  color="destructive"
                  className="pt-2"
                >
                  {error}
                </Text>
              )}
            </div>

            <CodeVerificationForm
              code={code}
              disabled={isVerifyDisabled}
              isVerifying={isVerifyingCode}
              onCodeChange={handleCodeChange}
              onSubmit={handleCodeSubmit}
            />
          </div>
        )}
      </PagePanel>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
