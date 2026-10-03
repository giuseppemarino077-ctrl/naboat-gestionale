import "./globals.css";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { themeColor: "#052f3f" };

export const metadata: Metadata = {
  title: "NaBoat Gestionale",
  description: "Flotta, calendario, prenotazioni e operatività giornaliera.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
};

// Layout radice: solo struttura HTML. I contenitori delle aree (sito, area cliente,
// gestionale, admin, pagine pubbliche per token) stanno nei rispettivi segmenti.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
