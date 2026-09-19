import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Cube Theory Lab — A Rubik’s Cube as a Graph",
  description:
    "Turn a Rubik’s Cube and watch each move trace a live path through its Cayley graph.",
  openGraph: {
    title: "Cube Theory Lab",
    description: "Every turn is an edge. Every position is a node.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cube Theory Lab" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cube Theory Lab",
    description: "Every turn is an edge. Every position is a node.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
