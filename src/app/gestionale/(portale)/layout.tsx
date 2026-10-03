import { StrutturaGestionale } from "@/components/Navigazione";
import { NotificheSalvataggio } from "@/components/ui/NotificheSalvataggio";

// Contenitore del gestionale operativo (noleggio, ormeggio, impostazioni):
// menù laterale, intestazione e controllo dell'azienda non attiva.
export default function LayoutPortale({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StrutturaGestionale>{children}</StrutturaGestionale>
      <NotificheSalvataggio />
    </>
  );
}
