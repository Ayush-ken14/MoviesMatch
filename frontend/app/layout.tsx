import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Atmosphere } from "@/components/Atmosphere";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter-tight",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CineMatch — Hybrid Movie Discovery",
  description:
    "A search-first movie discovery engine. BM25+ lexical retrieval fused with dense semantic search and cross-encoder reranking — tuned for Gotham nights.",
  applicationName: "CineMatch",
  authors: [{ name: "CineMatch" }],
  keywords: ["movie search", "semantic search", "hybrid retrieval", "film discovery"],
};

export const viewport: Viewport = {
  themeColor: "#070809",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Atmosphere />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
