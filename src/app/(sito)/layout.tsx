// Layout del sito pubblico (naboat.it): home, pagine informative e schede.
// Le pagine portano già intestazione e piede propri; qui il contenitore neutro.
export default function LayoutSito({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-ink">{children}</div>;
}
