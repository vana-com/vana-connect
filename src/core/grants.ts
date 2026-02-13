import type { GrantPayload } from "./types.js";

/**
 * Type guard that checks whether an unknown value has the shape of a {@link GrantPayload}.
 *
 * Validates the presence and types of required fields: `grantId`, `userAddress`,
 * `builderAddress`, and `scopes` (non-empty string array).
 *
 * @example
 * ```typescript
 * const body = await request.json();
 * if (!isValidGrant(body.grant)) {
 *   return NextResponse.json({ error: "Invalid grant" }, { status: 400 });
 * }
 * // body.grant is now typed as GrantPayload
 * const data = await getData({ privateKey, grant: body.grant });
 * ```
 */
export function isValidGrant(value: unknown): value is GrantPayload {
  if (value === null || typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.grantId === "string" &&
    obj.grantId.length > 0 &&
    typeof obj.userAddress === "string" &&
    obj.userAddress.length > 0 &&
    typeof obj.builderAddress === "string" &&
    obj.builderAddress.length > 0 &&
    Array.isArray(obj.scopes) &&
    obj.scopes.length > 0 &&
    obj.scopes.every((s: unknown) => typeof s === "string" && s.length > 0)
  );
}
