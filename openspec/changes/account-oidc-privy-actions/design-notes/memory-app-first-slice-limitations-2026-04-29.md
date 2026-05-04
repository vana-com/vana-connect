# Memory App First-Slice Limitations

This note scopes what the current Memory App fixture proves and what it does not
prove. It is intentionally narrow: the fixture is useful because it exercises the
account action contract without requiring deployed OIDC, real Privy sessions,
Postgres, storage, DP RPC, or a Personal Server.

## Proven In This PR

- `memory-app-dev` is registered as the first static OAuth client fixture.
- The RP fixture projects to Auth.js and `openid-client` shapes.
- The local Hydra POC proves standard OIDC login mechanics against a Vana-owned
  subject in a disposable environment.
- The account action fixture creates a mock action request using the real
  account-action handler.
- The account action fixture approves the request as a logged-in Vana user using
  the real decision handler.
- The fixture exchanges the returned `action_code` using the real exchange
  handler.
- The exchanged result is mock-only and does not return the raw action code,
  browser-carried `state`, or `vana_user_id`.
- The fixture records the first-slice event sequence:
  `action.requested`, `action.approved`, `action.exchanged`.

## Not Proven

- No headed Memory App or deployed Auth.js app has completed Login with Vana
  against deployed `https://account.vana.org`.
- No production OIDC discovery, token, userinfo, revoke, key rotation, or client
  registration surface is deployed.
- No real data source is read.
- No encrypted bundle or short-lived reference is produced for real data.
- No builder-side decryption flow is implemented.
- No live DP RPC write is performed; events are account-local in this slice.
- No L1 write or anchoring behavior is proven.
- No Personal Server participates in the flow.
- No offline read is supported. The fixture assumes the user-present,
  account-hosted action flow completes while the browser/session is active.
- No continuous sync is supported.
- No emergency revocation enforcement is proven beyond the existing short-lived
  action-code model.
- No cross-device read path is supported.
- No BYO-wallet or hardware-wallet signing path is implemented.
- No embedded-wallet protocol action is performed; `execution_mode = "mock"` is
  still the only approved first-slice execution mode.

## Practical Interpretation

The current proof is sufficient to validate the shape of the account-hosted
action contract:

1. A registered client can request an action.
2. Account can require login and user review.
3. Account can redirect with a short-lived code rather than data.
4. The client can exchange the code for a result.
5. Account can record auditable action events.

It is not sufficient to claim that Memory App can use real Vana data in
production. The next proof must choose one real data source and one non-mock
result mode, most likely an encrypted bundle behind a short-lived reference.
