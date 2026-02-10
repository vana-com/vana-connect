import ConnectFlow from "@/components/ConnectFlow";

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 540,
        margin: "0 auto",
        padding: "64px 24px",
      }}
    >
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 8px #22c55e66",
            }}
          />
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 11,
              fontWeight: 500,
              color: "#71717a",
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Vana Connect
          </span>
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#fafafa",
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          Next.js Starter
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#71717a",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Initiate a session, approve it from the Personal Server Dev UI, then
          fetch your data.
        </p>
      </div>
      <ConnectFlow />
    </main>
  );
}
