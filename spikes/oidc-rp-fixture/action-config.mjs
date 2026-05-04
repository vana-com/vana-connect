// Account-hosted action fixture for the dev Memory App client.
//
// This is the mock data-action companion to `auth-config.mjs`. It models the
// request body a Memory App-style relying party sends after Login with Vana,
// plus the action-code exchange body it sends after account.vana.org redirects
// back with an `action_code`.

import { buildRpFixture } from "./auth-config.mjs";

/**
 * @typedef {Object} MemoryActionFixture
 * @property {string} actionType
 * @property {"mock"} executionMode
 * @property {"mock"} resultMode
 * @property {string} state
 * @property {{ connector: string, scopes: string[], purposeCode: string, purposeDescription: string, accessMode: string }} requestedData
 * @property {{ title: string, description: string }} displayMetadata
 */

const DEFAULT_ACTION_TYPE = "memory.read.mock";
const DEFAULT_STATE = "memory-app-action-state-dev";

/**
 * @param {Partial<MemoryActionFixture>} [overrides]
 * @returns {MemoryActionFixture}
 */
export function buildMemoryActionFixture(overrides = {}) {
  return Object.freeze({
    actionType: overrides.actionType ?? DEFAULT_ACTION_TYPE,
    executionMode: "mock",
    resultMode: "mock",
    state: overrides.state ?? DEFAULT_STATE,
    requestedData: Object.freeze({
      connector: overrides.requestedData?.connector ?? "memory",
      scopes: Object.freeze(overrides.requestedData?.scopes ?? ["memory.read"]),
      purposeCode: overrides.requestedData?.purposeCode ?? "memory-app-demo",
      purposeDescription:
        overrides.requestedData?.purposeDescription ??
        "Let Memory App read mock memory data for this spike.",
      accessMode: overrides.requestedData?.accessMode ?? "read_once",
    }),
    displayMetadata: Object.freeze({
      title: overrides.displayMetadata?.title ?? "Share memory data",
      description:
        overrides.displayMetadata?.description ??
        "Memory App wants to read a mock memory dataset from your Vana account.",
    }),
  });
}

/**
 * @param {MemoryActionFixture} [actionFixture]
 * @param {ReturnType<typeof buildRpFixture>} [rpFixture]
 */
export function buildMemoryActionRequest(
  actionFixture = buildMemoryActionFixture(),
  rpFixture = buildRpFixture(),
) {
  return {
    client_id: rpFixture.clientId,
    redirect_uri: rpFixture.redirectUri,
    action_type: actionFixture.actionType,
    execution_mode: actionFixture.executionMode,
    result_mode: actionFixture.resultMode,
    requested_data: actionFixture.requestedData,
    display_metadata: actionFixture.displayMetadata,
    state: actionFixture.state,
  };
}

/**
 * @param {string} actionCode
 * @param {ReturnType<typeof buildRpFixture>} [rpFixture]
 */
export function buildMemoryActionExchangeRequest(
  actionCode,
  rpFixture = buildRpFixture(),
) {
  return {
    client_id: rpFixture.clientId,
    action_code: actionCode,
  };
}
