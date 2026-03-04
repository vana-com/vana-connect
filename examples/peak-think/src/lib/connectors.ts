import type { ConnectorDef } from "./types";

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "oura",
    label: "Oura Ring",
    description: "Sleep quality, readiness scores, and recovery data",
    icon: "\u{1F4A4}",
    scope: "oura.sleep",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    description: "Conversation history, topics, and thinking patterns",
    icon: "\u{1F9E0}",
    scope: "chatgpt.conversations",
  },
];
