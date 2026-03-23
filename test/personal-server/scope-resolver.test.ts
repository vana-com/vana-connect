import { describe, it, expect } from "vitest";
import { resolveScopes } from "../../src/personal-server/scope-resolver.js";
import type { ConnectorMetadata } from "../../src/connectors/registry.js";

describe("resolveScopes", () => {
  it("uses dotted keys directly when present in result", () => {
    const result = {
      "github.profile": { login: "alice" },
      "github.repos": [{ name: "my-repo" }],
    };

    const mappings = resolveScopes("github", result, null);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
      { scope: "github.repos", data: { items: [{ name: "my-repo" }] } },
    ]);
  });

  it("maps flat keys using metadata scopes", () => {
    const metadata: ConnectorMetadata = {
      id: "github",
      scopes: [
        { scope: "github.profile", label: "Profile" },
        { scope: "github.repos", label: "Repositories" },
      ],
    };
    const result = {
      profile: { login: "alice" },
      repos: [{ name: "my-repo" }],
    };

    const mappings = resolveScopes("github", result, metadata);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
      { scope: "github.repos", data: { items: [{ name: "my-repo" }] } },
    ]);
  });

  it("falls back to {source}.{key} without metadata", () => {
    const result = {
      profile: { login: "alice" },
      repos: [{ name: "my-repo" }],
    };

    const mappings = resolveScopes("github", result, null);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
      { scope: "github.repos", data: { items: [{ name: "my-repo" }] } },
    ]);
  });

  it("skips metadata scopes that have no matching key in result", () => {
    const metadata: ConnectorMetadata = {
      id: "github",
      scopes: [
        { scope: "github.profile", label: "Profile" },
        { scope: "github.stars", label: "Stars" },
      ],
    };
    const result = {
      profile: { login: "alice" },
    };

    const mappings = resolveScopes("github", result, metadata);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
    ]);
  });

  it("returns empty array for empty result", () => {
    const mappings = resolveScopes("github", {}, null);
    expect(mappings).toEqual([]);
  });

  it("excludes metadata-only keys (exportSummary, timestamp, version, platform) in fallback", () => {
    const result = {
      profile: { login: "alice" },
      exportSummary: { count: 1 },
      timestamp: "2026-01-01T00:00:00Z",
      version: "1.0",
      platform: "linux",
    };

    const mappings = resolveScopes("github", result, null);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
    ]);
  });

  it("excludes metadata-only keys from dotted-key strategy", () => {
    const result = {
      "github.profile": { login: "alice" },
      exportSummary: { count: 1 },
    };

    const mappings = resolveScopes("github", result, null);

    expect(mappings).toEqual([
      { scope: "github.profile", data: { login: "alice" } },
    ]);
  });

  it("normalizes camelCase dotted scopes to canonical snake_case", () => {
    const result = {
      "youtube.playlistItems": [{ id: "pl-1" }],
      "youtube.watchLater": [{ id: "vid-1" }],
    };

    const mappings = resolveScopes("youtube", result, null);

    expect(mappings).toEqual([
      {
        scope: "youtube.playlist_items",
        data: { items: [{ id: "pl-1" }] },
      },
      {
        scope: "youtube.watch_later",
        data: { items: [{ id: "vid-1" }] },
      },
    ]);
  });
});
