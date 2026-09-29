// Area cliente: nessun menù aziendale, le pagine gestiscono il proprio contenuto.
export default function LayoutArea({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
