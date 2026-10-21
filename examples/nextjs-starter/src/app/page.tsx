import ConnectFlow from "@/components/ConnectFlow";

export default function Home() {
  return (
    <main style={{ maxWidth: 540, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        Ad Insights
      </h1>
      <p style={{ fontSize: 14, color: "#71717a", marginBottom: 40 }}>
        Connect your Instagram to see which advertisers target you and what
        topics they think you care about.
      </p>
      <ConnectFlow />
    </main>
  );
}
