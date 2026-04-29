-- First-class local revocation state for account-hosted action grants.

ALTER TABLE account_action_requests
  DROP CONSTRAINT IF EXISTS account_action_requests_status_check,
  DROP CONSTRAINT IF EXISTS account_action_requests_check1,
  ADD CONSTRAINT account_action_requests_status_check
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed', 'revoked'));

ALTER TABLE account_consent_events
  DROP CONSTRAINT IF EXISTS account_consent_events_event_type_check,
  DROP CONSTRAINT IF EXISTS account_consent_events_check4,
  ADD CONSTRAINT account_consent_events_event_type_check
    CHECK (event_type IN ('action.requested', 'action.approved', 'action.denied', 'action.completed', 'action.exchanged', 'action.expired', 'action.revoked'));
