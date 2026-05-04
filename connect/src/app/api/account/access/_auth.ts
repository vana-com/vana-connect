import type { NextRequest } from "next/server";
import {
  ACCOUNT_LOGIN_SESSION_COOKIE,
  resolveAccountLoginSessionSecret,
  verifyAccountLoginSessionToken,
} from "@/lib/auth/account-login-session";
import {
  findLinkedWalletsByUser,
  findProviderLinksByUser,
  resolveVanaUserByPrivyEvidence,
} from "@/lib/db/account";
import {
  listActionRequestsByUser,
  listActionResultsForRequests,
  listConsentEventsByUser,
} from "@/lib/db/account-actions";

export async function resolveAccountAccessUser(request: NextRequest) {
  const token = request.cookies.get(ACCOUNT_LOGIN_SESSION_COOKIE)?.value;
  const secret = token ? resolveAccountLoginSessionSecret() : null;
  const evidence =
    token && secret ? verifyAccountLoginSessionToken(token, { secret }) : null;

  if (!evidence) return null;
  return resolveVanaUserByPrivyEvidence(evidence);
}

export async function buildFreshAccountAccessSummary(vanaUserId: string) {
  const [providerLinks, linkedWallets, actionRequests, consentEvents] =
    await Promise.all([
      findProviderLinksByUser(vanaUserId),
      findLinkedWalletsByUser(vanaUserId),
      listActionRequestsByUser(vanaUserId, { limit: 25 }),
      listConsentEventsByUser(vanaUserId, { limit: 50 }),
    ]);
  const actionResults = await listActionResultsForRequests(
    actionRequests.map((requestRow) => requestRow.id),
  );

  return {
    providerLinks,
    linkedWallets,
    actionRequests,
    actionResults,
    consentEvents,
  };
}
