/**
 * Production wiring for the `/auth/oidc/*` route handlers.
 *
 * Route files import `runOidcLogin` / `runOidcConsent` and only need to know
 * about Next.js. This module is the only place that pulls in concrete deps
 * (Hydra admin client, Privy verifier, DB resolution helper), so route files
 * stay thin and the pure handlers in `lib/auth/oidc-routes.ts` stay testable
 * without a server.
 *
 * Note: production Privy identity-token verification uses Privy's Node SDK.
 * `PRIVY_VERIFICATION_KEY` can be supplied as an override, otherwise the SDK
 * resolves the app JWKS for the configured Privy app.
 */

import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import { createHydraAdminClient } from "@/lib/auth/hydra-admin";
import {
  createPrivyLoginSessionAdapter,
  type LoginEvidence,
  type PrivyVerifiedUser,
} from "@/lib/auth/login-session-adapter";
import {
  type HydraAdminClientForOidc,
  handleOidcConsent,
  handleOidcLogin,
  type OidcRouteResult,
} from "@/lib/auth/oidc-routes";
import {
  findLinkedWalletsByUser,
  findProviderLinksByUser,
  resolveVanaUserByPrivyEvidence,
} from "@/lib/db/account";

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error(
        "Privy verification is not configured (PRIVY_APP_ID and PRIVY_APP_SECRET)",
      );
    }
    privyClient = new PrivyClient({
      appId,
      appSecret,
      jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY,
    });
  }
  return privyClient;
}

async function verifyPrivyIdentityToken(
  token: string,
): Promise<PrivyVerifiedUser> {
  const user = await getPrivyClient().users().get({ id_token: token });
  return user as unknown as PrivyVerifiedUser;
}

function buildAdapters(): {
  hydra: HydraAdminClientForOidc;
  sessionAdapter: ReturnType<typeof createPrivyLoginSessionAdapter>;
} {
  return {
    hydra: createHydraAdminClient(),
    sessionAdapter: createPrivyLoginSessionAdapter({
      verifyIdentityToken: verifyPrivyIdentityToken,
    }),
  };
}

async function resolveVanaUser(input: LoginEvidence) {
  const { user, created } = await resolveVanaUserByPrivyEvidence({
    privySubject: input.privySubject,
    email: input.email ?? null,
    embeddedWallet: input.embeddedWallet
      ? {
          chainType: input.embeddedWallet.chainType,
          address: input.embeddedWallet.address,
          providerWalletId: input.embeddedWallet.providerWalletId ?? null,
        }
      : undefined,
  });
  return { user: { id: user.id }, created };
}

async function loadAccountClaims(vanaUserId: string) {
  const [wallets, providerLinks] = await Promise.all([
    findLinkedWalletsByUser(vanaUserId),
    findProviderLinksByUser(vanaUserId),
  ]);
  return {
    linkedWallets: wallets.map((wallet) => ({
      provider: wallet.provider,
      chainType: wallet.chain_type,
      address: wallet.address,
      isPrimary: wallet.is_primary,
    })),
    email: providerLinks.find((link) => link.email)?.email ?? null,
  };
}

function toNextResponse(result: OidcRouteResult, requestUrl: string): Response {
  if (result.kind === "redirect") {
    return NextResponse.redirect(new URL(result.location, requestUrl), {
      status: result.status,
    });
  }
  return new NextResponse(result.message, { status: result.status });
}

export async function runOidcLogin(request: Request): Promise<Response> {
  const { hydra, sessionAdapter } = buildAdapters();
  const url = new URL(request.url);
  const result = await handleOidcLogin({
    loginChallenge: url.searchParams.get("login_challenge"),
    hydra,
    sessionAdapter,
    resolveVanaUser,
    request,
  });
  return toNextResponse(result, request.url);
}

export async function runOidcConsent(request: Request): Promise<Response> {
  const { hydra } = buildAdapters();
  const url = new URL(request.url);
  const result = await handleOidcConsent({
    consentChallenge: url.searchParams.get("consent_challenge"),
    hydra,
    loadAccountClaims,
  });
  return toNextResponse(result, request.url);
}
