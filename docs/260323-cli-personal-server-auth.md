# CLI Personal Server Auth

The CLI treats Personal Server auth as a normal owner-session flow, not as the old DataConnect dev-bypass flow.

## Local and Remote Behavior

- Self-hosted CLI login uses the Personal Server `/auth/device` flow to obtain an owner session token.
- Self-hosted browser approval stays on the Personal Server URL the CLI targeted for login.
- Remote self-hosted approval uses the owner wallet directly against the Personal Server approval page.
- Cloud CLI login gets a fresh 30-day Personal Server session token from account.vana.org.
- account.vana.org provisions that session token into the running cloud Personal Server using the long-lived control-plane `PS_ACCESS_TOKEN`.
- Remote Personal Server requests resolve bearer auth from `VANA_PS_TOKEN` first, then from saved CLI credentials.
- Localhost Personal Server usage is the normal local product path. It should work without depending on `devToken`.

## Legacy Dev Bypass

- `devToken` and server-side `devBypass` are legacy local/test shortcuts from the DataConnect era.
- The CLI does not model normal owner sessions as `devToken` auth.
- If a bypass mode is needed for tests or internal automation, it should stay explicit and separate from standard CLI login.

## Launch Contract

- CLI session tokens expire after 30 days and require explicit re-login. There is no refresh flow in the launch contract.
- `vana logout` revokes the active Personal Server session token server-side before clearing local credentials.
- The token returned to the CLI is not the same credential that bootstraps the cloud VM.
