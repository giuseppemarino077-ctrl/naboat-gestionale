import { StrutturaAdmin } from "@/components/admin/StrutturaAdmin";

// Pannello amministrativo NaBoat: contenitore autonomo (nessun menù aziendale).
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return <StrutturaAdmin>{children}</StrutturaAdmin>;
}
