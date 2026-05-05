import type { NextRequest } from "next/server";
import { getVanaSession } from "@/lib/auth/vana-session";
import {
  findLinkedWalletsByUser,
  findProviderLinksByUser,
  findVanaUserById,
} from "@/lib/db/account";
import {
  listActionRequestsByUser,
  listActionResultsForRequests,
  listConsentEventsByUser,
} from "@/lib/db/account-actions";
import type { VanaUserRow } from "@/lib/auth/vana-account";

/**
 * Resolve the current account-access caller from a Vana session.
 *
 * Returns `null` when no valid session is present, mirroring the legacy
 * helper's null-on-missing semantics. The route handler converts that to a
 * 401. The returned `user` is loaded from the canonical `vana_users` row keyed
 * by `session.vanaUserId` so summary builders that expect a `VanaUserRow`
 * continue to work unchanged.
 */
export async function resolveAccountAccessUser(
  request: NextRequest,
): Promise<{ user: VanaUserRow } | null> {
  const session = await getVanaSession(request);
  if (!session) return null;
  const user = await findVanaUserById(session.vanaUserId);
  if (!user) return null;
  return { user };
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
