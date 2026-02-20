# Auth UI Follow-ups (Post-Merge)

- Rename `view: "email"` to `view: "entry"` (or similar).  
  Why: current name is misleading because that screen includes email + Google + Apple, not just email.

- Track selected OAuth provider explicitly (`pendingOAuthProvider: "google" | "apple" | null`).  
  Why: current loading state comes from a shared OAuth status, so provider-specific UI intent gets lost.

- Derive loading per provider from `pendingOAuthProvider` instead of one shared `oauthState.status === "loading"` for both buttons.  
  Why: clicking Apple should only show Apple loading (same for Google), matching user expectation and debug scenarios.

- Do not force `view = "completing"` on OAuth `loading`; only move to completing once callback/finalization starts.  
  Why: right now the entry screen disappears too early, so button-level loading states are barely visible in real flow.
