import CareerApp from "@/components/CareerApp";

export default function Home() {
  return (
    <main className="container">
      <h1>Career Analyzer</h1>
      <p className="subtitle">
        Connect your LinkedIn and Spotify data to get AI-powered career insights
        — profile optimization, career trajectory analysis, and how your music
        taste maps to your work style.
      </p>
      <CareerApp />
    </main>
  );
}
