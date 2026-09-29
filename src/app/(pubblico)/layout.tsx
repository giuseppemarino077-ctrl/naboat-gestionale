// Pagine pubbliche raggiungibili con un solo token (pagamento, contratto):
// nessun menù, contenuto centrato. L'accesso non è richiesto.
export default function LayoutPubblico({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-4">{children}</div>;
}
