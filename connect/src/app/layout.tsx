import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/app/_components/app-providers";
import { CONNECT_CONFIG } from "@/config/config";
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
  metadataBase: new URL(CONNECT_CONFIG.app.siteUrl),
  title: {
    default: CONNECT_CONFIG.app.name,
    template: `%s | ${CONNECT_CONFIG.app.name}`,
  },
  description: CONNECT_CONFIG.app.description,
  applicationName: CONNECT_CONFIG.app.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: CONNECT_CONFIG.app.name,
  },
  openGraph: {
    type: "website",
    siteName: CONNECT_CONFIG.app.name,
    title: CONNECT_CONFIG.app.name,
    description: CONNECT_CONFIG.app.description,
    locale: "en_US",
    // images: [
    //   {
    //     url: "/opengraph.png",
    //     width: 1200,
    //     height: 630,
    //     alt: "Vana - Own your data",
    //     type: "image/png",
    //   },
    // ],
  },
  twitter: {
    card: "summary_large_image",
    title: CONNECT_CONFIG.app.name,
    description: CONNECT_CONFIG.app.description,
    images: ["/opengraph.png"],
    // creator: APP_METADATA.twitterHandle,
    // site: APP_METADATA.twitterHandle,
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  robots:
    process.env.NODE_ENV === "development"
      ? {
          index: false,
          follow: false,
        }
      : undefined,
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
