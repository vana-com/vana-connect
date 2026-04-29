import type { RequestedData } from "./account-action";

export type RequestedDataDisplay = {
  data_source: string;
  data_types: string;
  purpose: string;
  access_duration: string;
  summary: string;
};

const ACTION_LABELS: Record<string, string> = {
  "data.read.chatgpt": "Read ChatGPT data",
};

const CONNECTOR_LABELS: Record<string, string> = {
  "chatgpt-playwright": "ChatGPT",
};

const SCOPE_LABELS: Record<string, string> = {
  "chatgpt.memories": "memories",
  "chatgpt.conversations": "conversation history",
};

const ACCESS_MODE_LABELS: Record<string, string> = {
  read_until_revoked: "Until you revoke access",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
  consumed: "Used",
  revoked: "Revoked",
};

export function formatActionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? humanizeIdentifier(actionType);
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeIdentifier(status);
}

export function formatRequestedDataDisplay(
  requestedData: RequestedData,
): RequestedDataDisplay {
  const dataSource = requestedData.connector
    ? formatConnectorLabel(requestedData.connector)
    : "Not specified";
  const dataTypes = requestedData.scopes?.length
    ? joinList(requestedData.scopes.map(formatScopeLabel))
    : "Not specified";
  const purpose =
    requestedData.purposeDescription ??
    (requestedData.purposeCode
      ? humanizeIdentifier(requestedData.purposeCode)
      : "No reason provided");
  const accessDuration = requestedData.accessMode
    ? (ACCESS_MODE_LABELS[requestedData.accessMode] ??
      humanizeIdentifier(requestedData.accessMode))
    : "Not specified";

  return {
    data_source: dataSource,
    data_types: dataTypes,
    purpose,
    access_duration: accessDuration,
    summary: `${dataSource}: ${dataTypes}. ${purpose} Access: ${accessDuration}.`,
  };
}

function formatConnectorLabel(connector: string): string {
  return CONNECTOR_LABELS[connector] ?? humanizeIdentifier(connector);
}

function formatScopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? humanizeIdentifier(scope);
}

function humanizeIdentifier(value: string): string {
  const words = value
    .replace(/[_-]/g, ".")
    .split(".")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : value;
}

function joinList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
