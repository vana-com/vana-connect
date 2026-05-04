/**
 * Production wiring for the `/api/account/actions/*` route handlers.
 *
 * Route files import the `run*` functions and only need to know about
 * Next.js. This module is the only place that pulls in concrete deps (DB
 * helpers, login session adapter, vana-user resolver), so route files stay
 * thin and the pure handlers in `lib/auth/account-action-routes.ts` stay
 * testable without a server.
 */

import { PrivyClient } from "@privy-io/node";
import { NextResponse } from "next/server";
import {
  type CreateActionRequestResult,
  type DecisionRouteResult,
  type ExchangeActionCodeResult,
  type GetActionRequestResult,
  handleActionDecision,
  handleCreateActionRequest,
  handleExchangeActionCode,
  handleGetActionRequest,
} from "@/lib/auth/account-action-routes";
import {
  createPrivyLoginSessionAdapter,
  type LoginEvidence,
  type PrivyVerifiedUser,
} from "@/lib/auth/login-session-adapter";
import {
  findLinkedWalletsByUser,
  resolveVanaUserByPrivyEvidence,
} from "@/lib/db/account";
import {
  consumeActionCodeWithExchangeEvent,
  findActionRequestById,
  insertActionRequest,
  insertConsentEvent,
  persistActionDecisionBundle,
} from "@/lib/db/account-actions";
import { findOauthClientById } from "@/lib/db/oauth-clients";
import { findServerByUserId } from "@/lib/db/neon";
import { executeGrantViaPersonalServer } from "@/lib/auth/execute-grant-via-personal-server";
import type { RequestedData } from "@/lib/auth/account-action";

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

async function resolveVanaUser(input: LoginEvidence) {
  const { user } = await resolveVanaUserByPrivyEvidence({
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
  return { user: { id: user.id } };
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function toCreateResponse(result: CreateActionRequestResult): Response {
  if (result.kind === "ok") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(
    { error: { code: result.code, message: result.message } },
    { status: result.status },
  );
}

function toExchangeResponse(result: ExchangeActionCodeResult): Response {
  if (result.kind === "ok") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(
    { error: { code: result.code, message: result.message } },
    { status: result.status },
  );
}

function toGetResponse(result: GetActionRequestResult): Response {
  if (result.kind === "ok") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(
    { error: { code: result.code, message: result.message } },
    { status: result.status },
  );
}

function toDecisionResponse(result: DecisionRouteResult): Response {
  if (result.kind === "ok") {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(
    { error: { code: result.code, message: result.message } },
    { status: result.status },
  );
}

export async function runCreateActionRequest(
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const result = await handleCreateActionRequest({
    body,
    insertActionRequest,
    insertConsentEvent,
    baseUrl,
  });
  return toCreateResponse(result);
}

export async function runExchangeActionCode(
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const result = await handleExchangeActionCode({
    body,
    consumeActionCodeWithExchangeEvent,
  });
  return toExchangeResponse(result);
}

export async function runGetActionRequest(
  request: Request,
  actionRequestId: string,
): Promise<Response> {
  const sessionAdapter = createPrivyLoginSessionAdapter({
    verifyIdentityToken: verifyPrivyIdentityToken,
  });
  const result = await handleGetActionRequest({
    request,
    actionRequestId,
    sessionAdapter,
    resolveVanaUser,
    findActionRequestById,
  });
  return toGetResponse(result);
}

async function resolveSubjectWalletAddress(
  vanaUserId: string,
): Promise<string | null> {
  const wallets = await findLinkedWalletsByUser(vanaUserId);
  // Primary wallet wins; fall back to first verified Ethereum wallet.
  const primary = wallets.find((w) => w.is_primary);
  if (primary) return primary.address;
  const firstEth = wallets.find((w) => w.chain_type === "ethereum");
  return firstEth?.address ?? null;
}

export async function runActionDecision(
  request: Request,
  actionRequestId: string,
): Promise<Response> {
  const body = await readJsonBody(request);
  const sessionAdapter = createPrivyLoginSessionAdapter({
    verifyIdentityToken: verifyPrivyIdentityToken,
  });
  const result = await handleActionDecision({
    request,
    actionRequestId,
    body,
    sessionAdapter,
    resolveVanaUser,
    findActionRequestById,
    persistActionDecisionBundle,
    resolveSubjectWalletAddress,
    executeGrant: async (input) => {
      const requestedData = input.requestedData as RequestedData;
      return executeGrantViaPersonalServer({
        vanaUserId: input.vanaUserId,
        clientId: input.clientId,
        scopes: requestedData.scopes ?? [],
        // expiresAt + nonce are caller-driven; first slice mints unbounded
        // grants (expiresAt=0 = no expiry) with epoch-ms nonce. Future
        // slices may pull these from the request body.
        expiresAt: 0,
        nonce: Date.now(),
        resolvePersonalServer: async (vanaUserId) => {
          // vana_user_id → primary wallet → personal_servers row
          const subject = await resolveSubjectWalletAddress(vanaUserId);
          if (!subject) return null;
          const server = await findServerByUserId(subject.toLowerCase());
          if (!server || !server.url || !server.control_plane_token)
            return null;
          return {
            serverId: server.id,
            serverUrl: server.url,
            controlPlaneSecret: server.control_plane_token,
          };
        },
        resolveOauthClient: async (clientId) => findOauthClientById(clientId),
      });
    },
  });
  return toDecisionResponse(result);
}
