import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/app/_components/app-providers";
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

const gtAmericaMono = localFont({
  src: [
    {
      path: "../fonts/GT-America-Mono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/GT-America-Mono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/GT-America-Mono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-gt-america-mono",
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
    <html lang="en" className={`${inter.variable} ${gtAmericaMono.variable}`}>
      <body className="">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
