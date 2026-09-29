// Accesso, registrazione, invito, verifica email e recupero password: pagine senza menù,
// contenuto centrato. Non ereditano il contenitore operativo del gestionale.
export default function LayoutAccesso({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-4">{children}</div>;
}
