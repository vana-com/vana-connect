import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test Builder App — Vana Connect",
  description: "E2E test app for the Vana Connect flow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: "#0a0a0a",
          color: "#e0e0e0",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
