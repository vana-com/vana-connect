import AskFlow from "@/components/ConnectFlow";

export default function Home() {
  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Talk to You</h1>
        <p className="page-subtitle">
          Chat with an AI version of yourself, built from your digital presence.
        </p>
      </div>
      <AskFlow />
      <div className="powered-by">Powered by Vana Connect</div>
    </main>
  );
}
