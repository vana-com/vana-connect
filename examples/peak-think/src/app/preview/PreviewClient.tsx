"use client";

import Dashboard from "@/components/Dashboard";
import ChatInterface from "@/components/ChatInterface";
import { MOCK_ANALYSIS } from "@/lib/mock-data";

export default function PreviewClient() {
  return (
    <>
      <Dashboard analysis={MOCK_ANALYSIS} />
      <div style={{ marginTop: 32 }}>
        <ChatInterface analysis={MOCK_ANALYSIS} />
      </div>
    </>
  );
}
