import ConnectFlow from "@/components/ConnectFlow";

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "48px 20px",
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "#00ff88",
          marginBottom: 8,
        }}
      >
        Test Builder App
      </h1>
      <p style={{ fontSize: 14, color: "#808080", marginBottom: 32 }}>
        Demonstrates the &quot;Sign in with Vana&quot; Connect flow. Click the
        button below to initiate a session, then approve it from the Personal
        Server Dev UI.
      </p>
      <ConnectFlow />
    </main>
  );
}
