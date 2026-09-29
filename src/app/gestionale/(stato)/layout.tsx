// Stato dell'azienda non ancora attiva: schermata a sé, senza menù operativo.
export default function LayoutStato({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-4">{children}</div>;
}
