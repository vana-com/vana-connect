-- Vana auth — retire session tombstones.
--
-- Logout now revokes the Hydra session and deletes the matching
-- vana_active_sessions rows. getVanaSession still accepts cached Hydra
-- introspection results, but it resolves the active-session row after that
-- cache; missing or expired rows are rejected.

DROP TABLE IF EXISTS vana_session_tombstones;
