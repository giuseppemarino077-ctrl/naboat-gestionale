import { StrutturaGestionale } from "@/components/Navigazione";

// Contenitore del gestionale operativo (noleggio, ormeggio, impostazioni):
// menù laterale, intestazione e controllo dell'azienda non attiva.
export default function LayoutPortale({ children }: { children: React.ReactNode }) {
  return <StrutturaGestionale>{children}</StrutturaGestionale>;
}
