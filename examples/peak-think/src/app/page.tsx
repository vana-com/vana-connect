import PeakThinkApp from "@/components/PeakThinkApp";

export default function Home() {
  return (
    <main className="app-container">
      <div className="app-header">
        <h1 className="app-title">Peak Think</h1>
        <p className="app-subtitle">
          Discover when your mind does its best work. Connect your Oura ring and
          ChatGPT data to reveal the hidden patterns between sleep quality and
          cognitive performance.
        </p>
      </div>
      <PeakThinkApp />
    </main>
  );
}
