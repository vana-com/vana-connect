import type { Metadata } from "next";
import localFont from "next/font/local";
import "../styles/index.css";

const inter = localFont({
  src: [
    {
      path: "../fonts/InterVariable.ttf",
      style: "normal",
    },
    {
      path: "../fonts/InterVariable-Italic.ttf",
      style: "italic",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataConnect",
  description: "DataConnect",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="">{children}</body>
    </html>
  );
}
