import type {
  ActionRequestRow,
  ActionResultRow,
  ConsentEventRow,
  RequestedData,
} from "@/lib/auth/account-action";
import {
  formatActionLabel,
  formatRequestedDataDisplay,
  type RequestedDataDisplay,
} from "@/lib/auth/action-display";
import { createDefaultOauthClientRegistry } from "@/lib/auth/oauth-client-policy";
import type {
  LinkedWalletRow,
  ProviderLinkRow,
  VanaUserRow,
} from "@/lib/auth/vana-account";

export type AccountAccessSummary = {
  account: {
    vana_user_id: string;
    display_name: string | null;
    created_at: string;
  };
  provider_links: Array<{
    provider: string;
    email: string | null;
    provider_subject: string;
    created_at: string;
  }>;
  linked_wallets: Array<{
    chain: string;
    address: string;
    provider: string;
    primary: boolean;
    verified_at: string | null;
  }>;
  connected_apps: Array<{
    client_id: string;
    display_name: string;
    active_grant_count: number;
    total_request_count: number;
    event_count: number;
    last_seen_at: string;
    last_grant_at: string | null;
    last_revoked_at: string | null;
    can_disconnect: boolean;
  }>;
  access_requests: Array<{
    id: string;
    client_id: string;
    app_name: string;
    action_type: string;
    action_label: string;
    execution_mode: string;
    result_mode: string;
    requested_data_summary: string;
    requested_data_display: RequestedDataDisplay;
    status: string;
    created_at: string;
    decided_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    result_state: string | null;
    can_revoke: boolean;
    revocation_note: string | null;
    revoke_note: string | null;
  }>;
  activity: Array<{
    id: string;
    event_type: string;
    occurred_at: string;
    client_id: string;
    app_name: string;
    action_type: string;
    action_label: string;
    decision: string | null;
    requested_data_summary: string;
    requested_data_display: RequestedDataDisplay;
    revocation_note: string | null;
  }>;
};

const registry = createDefaultOauthClientRegistry();

export function getClientDisplayName(clientId: string): string {
  return registry.resolve(clientId)?.displayName ?? clientId;
}

export function summarizeRequestedData(requestedData: RequestedData): string {
  return formatRequestedDataDisplay(requestedData).summary;
}

export function buildAccountAccessSummary(input: {
  user: VanaUserRow;
  providerLinks: ProviderLinkRow[];
  linkedWallets: LinkedWalletRow[];
  actionRequests: ActionRequestRow[];
  actionResults: ActionResultRow[];
  consentEvents: ConsentEventRow[];
}): AccountAccessSummary {
  const resultsByRequest = new Map(
    input.actionResults.map((result) => [result.action_request_id, result]),
  );
  const revocationEventsByRequest = new Map(
    input.consentEvents
      .filter((event) => event.event_type === "action.revoked")
      .map((event) => [event.action_request_id, event]),
  );
  const appMap = new Map<
    string,
    {
      active_grant_count: number;
      total_request_count: number;
      event_count: number;
      last_seen_at: string;
      last_grant_at: string | null;
      last_revoked_at: string | null;
    }
  >();

  for (const request of input.actionRequests) {
    const app = appMap.get(request.client_id) ?? {
      active_grant_count: 0,
      total_request_count: 0,
      event_count: 0,
      last_seen_at: request.created_at,
      last_grant_at: null,
      last_revoked_at: null,
    };
    app.total_request_count += 1;
    if (isActiveGrant(request)) {
      app.active_grant_count += 1;
      if (
        request.decided_at &&
        (!app.last_grant_at || request.decided_at > app.last_grant_at)
      ) {
        app.last_grant_at = request.decided_at;
      }
    }
    if (request.created_at > app.last_seen_at)
      app.last_seen_at = request.created_at;
    appMap.set(request.client_id, app);
  }

  for (const event of input.consentEvents) {
    const app = appMap.get(event.client_id) ?? {
      active_grant_count: 0,
      total_request_count: 0,
      event_count: 0,
      last_seen_at: event.occurred_at,
      last_grant_at: null,
      last_revoked_at: null,
    };
    app.event_count += 1;
    if (event.event_type === "action.revoked") {
      app.last_revoked_at = event.occurred_at;
    }
    if (event.occurred_at > app.last_seen_at)
      app.last_seen_at = event.occurred_at;
    appMap.set(event.client_id, app);
  }

  return {
    account: {
      vana_user_id: input.user.id,
      display_name: input.user.display_name,
      created_at: input.user.created_at,
    },
    provider_links: input.providerLinks.map((link) => ({
      provider: link.provider,
      email: link.email,
      provider_subject: link.provider_subject,
      created_at: link.created_at,
    })),
    linked_wallets: input.linkedWallets.map((wallet) => ({
      chain: wallet.chain_type,
      address: wallet.address,
      provider: wallet.provider,
      primary: wallet.is_primary,
      verified_at: wallet.verified_at,
    })),
    connected_apps: [...appMap.entries()]
      .map(([clientId, app]) => ({
        client_id: clientId,
        display_name: getClientDisplayName(clientId),
        can_disconnect: app.active_grant_count > 0,
        ...app,
      }))
      .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
    access_requests: input.actionRequests.map((request) => {
      const result = resultsByRequest.get(request.id);
      const revocationEvent = revocationEventsByRequest.get(request.id);
      const canRevoke = isActiveGrant(request);
      const requestedDataDisplay = formatRequestedDataDisplay(
        request.requested_data,
      );
      return {
        id: request.id,
        client_id: request.client_id,
        app_name: getClientDisplayName(request.client_id),
        action_type: request.action_type,
        action_label: formatActionLabel(request.action_type),
        execution_mode: request.execution_mode,
        result_mode: request.result_mode,
        requested_data_summary: requestedDataDisplay.summary,
        requested_data_display: requestedDataDisplay,
        status: request.status,
        created_at: request.created_at,
        decided_at: request.decided_at,
        expires_at: request.expires_at,
        revoked_at: revocationEvent?.occurred_at ?? null,
        result_state: result
          ? `Exchange ${result.consumed_at ? "consumed" : "available"}`
          : null,
        can_revoke: canRevoke,
        revocation_note: revocationEvent
          ? formatRevocationNote(revocationEvent.authorization_reference)
          : null,
        revoke_note: canRevoke
          ? "RPC revocation is mocked; local grant state will be revoked."
          : null,
      };
    }),
    activity: input.consentEvents.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      client_id: event.client_id,
      app_name: getClientDisplayName(event.client_id),
      action_type: event.action_type,
      action_label: formatActionLabel(event.action_type),
      decision: event.decision,
      requested_data_summary: summarizeRequestedData(event.requested_data),
      requested_data_display: formatRequestedDataDisplay(event.requested_data),
      revocation_note:
        event.event_type === "action.revoked"
          ? formatRevocationNote(event.authorization_reference)
          : null,
    })),
  };
}

function isActiveGrant(request: ActionRequestRow): boolean {
  return request.status === "approved" || request.status === "consumed";
}

function formatRevocationNote(
  reference: Record<string, unknown> | null,
): string | null {
  if (reference?.mode !== "mock_rpc_revoke") return null;
  return "Revoked locally; RPC/on-chain revocation is mocked.";
}
