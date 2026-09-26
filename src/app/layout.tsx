import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Struttura } from "@/components/Navigazione";

export const viewport: Viewport = { themeColor: "#c2410c" };

export const metadata: Metadata = {
  title: "NaBoat Gestionale",
  description: "Flotta, calendario, prenotazioni e operatività giornaliera.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Struttura>{children}</Struttura>
      </body>
    </html>
  );
}
