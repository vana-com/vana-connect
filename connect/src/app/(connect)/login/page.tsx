"use client";

import { MailIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { LegalAcceptance } from "@/app/_components/legal-acceptance";
import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { PageLoadingState } from "@/components/elements/page-loading-state";
import { SingleFieldIconForm } from "@/components/elements/single-field-icon-form";
import { Text } from "@/components/typography/text";
import { CONNECT_CONFIG } from "@/config/config";
import { cn } from "@/lib/classes";
import { CodeVerificationForm } from "./_components/code-verification-form";
import { SocialAuthButton } from "./_components/social-auth-button";
import { LOGIN_PAGE_SPINNER_VIEWS, useLoginPage } from "./use-login-page";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    handleBackToEmail,
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

  function handleBackFromCode() {
    if (searchParams.get("authDebug") === "1") {
      const next = new URLSearchParams(searchParams);
      next.set("scenario", "login-idle");
      router.replace(`/login?${next}`);
    } else {
      handleBackToEmail();
    }
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
    <PageShell>
      <PagePanel className="md:min-h-[563px]">
        {/* Loading / Completing */}
        {LOGIN_PAGE_SPINNER_VIEWS.includes(view) && (
          <PageLoadingState
            showVanaLogotype
            message={view === "completing" ? "Signing you in…" : "Preparing…"}
          />
        )}

        {/* Email entry */}
        {view === "entry" && (
          <div className="space-y-small">
            <PageHeader
              showVanaLogotype
              color="foreground"
              heading={
                <>
                  <span className="text-iris">Sign in to Vana</span>
                  <br />
                  to connect your data
                </>
              }
              description={
                <Text>
                  Sign in to authorize and share your data everywhere.
                </Text>
              }
            />

            <div className="space-y-3">
              <SingleFieldIconForm
                id="auth-email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                onSubmit={() => handleEmailSubmitWithPassportAgreement()}
                isLoading={isSendingEmail}
                disabled={isEmailDisabled}
                submitAriaLabel="Send sign-in code"
                leading={
                  <MailIcon
                    className="text-muted-foreground group-focus-within:text-foreground"
                    aria-hidden="true"
                  />
                }
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
              {error && (
                <Text
                  as="p"
                  intent="small"
                  color="destructive"
                  className="pt-2"
                  aria-live="polite"
                >
                  {error}
                </Text>
              )}
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
          <div className="flex flex-col flex-1 space-y-small">
            <PageHeader
              showVanaLogotype
              heading="Enter the code we emailed"
              color="iris"
              description={
                <Text>Please check your email for the code we just sent.</Text>
              }
            />

            <CodeVerificationForm
              code={code}
              disabled={isVerifyDisabled}
              isVerifying={isVerifyingCode}
              onCodeChange={handleCodeChange}
              onSubmit={handleCodeSubmit}
              className="flex-1 flex flex-col justify-center"
              errorSlot={
                <div
                  aria-hidden={!error}
                  className={cn(!error && "opacity-0 pointer-events-none")}
                >
                  <Text
                    as="p"
                    color="destructive"
                    aria-live={error ? "polite" : undefined}
                  >
                    {error ? (
                      <>
                        {error} Or{" "}
                        <button
                          type="button"
                          onClick={handleBackFromCode}
                          className="link text-destructive-foreground cursor-pointer"
                        >
                          try signing in again
                        </button>
                        .
                      </>
                    ) : (
                      "\u00A0"
                    )}
                  </Text>
                </div>
              }
            />
          </div>
        )}
      </PagePanel>
    </PageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoadingState showVanaLogotype />}>
      <LoginPageContent />
    </Suspense>
  );
}
