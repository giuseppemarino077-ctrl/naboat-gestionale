import type { Metadata } from "next";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { prisma } from "@/lib/db";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Per i noleggiatori — il gestionale e il profilo pubblico | NaBoat",
  description: "NaBoat per chi noleggia barche: calendario, prenotazioni, pagamenti, contratti e un profilo pubblico della tua azienda. Tre passi per iniziare.",
  robots: { index: true, follow: true },
};

const FUNZIONI = [
  "Giornata in banchina e calendario della flotta",
  "Prenotazioni da ogni canale, con storico e stati",
  "Incassi, acconti, cauzione con blocco carta",
  "Contratti digitali e check-in con foto",
  "Resoconto di incassi, spese e margini",
  "Modulo ormeggio per chi custodisce barche",
];

const PASSI = [
  { n: "1", t: "Registra l'azienda", d: "Due minuti dal sito, senza impegno: scegli se fai noleggio, ormeggio o entrambi." },
  { n: "2", t: "Carica la flotta", d: "Barche, foto, prezzi e porti. NaBoat ti guida nell'attivazione." },
  { n: "3", t: "Ricevi richieste", d: "Il tuo profilo pubblico porta clienti; il gestionale li trasforma in prenotazioni." },
];

const DOMANDE = [
  { d: "Quanto costa?", r: "L'attivazione e il canone del gestionale sono separati dal marketplace e si concordano in fase di attivazione. Nessun costo nascosto." },
  { d: "Serve un'app?", r: "No: il web funziona da computer e telefono. Le app native sono previste in una fase successiva." },
  { d: "Posso usare solo il gestionale?", r: "Sì: puoi spegnere la pubblicazione sul marketplace e usare NaBoat come gestionale interno." },
  { d: "E l'ormeggio?", r: "C'è un modulo dedicato per chi custodisce barche di privati, in acqua o a terra, con conti, contratti e pagamenti." },
];

export default async function PerNoleggiatoriPage() {
  const { appBase } = await contestoSito();
  const esempio = await prisma.tenant
    .findFirst({ where: { status: "active", slug: { not: null }, boats: { some: { pubblicata: true, inPausa: false } } }, select: { slug: true, nome: true } })
    .catch(() => null);

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <section className="bg-deep text-white">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h1 className="font-display text-4xl font-extrabold">Per i noleggiatori</h1>
          <p className="mt-3 max-w-2xl text-white/85">Il gestionale completo e un profilo pubblico della tua azienda, con il tuo indirizzo da condividere su WhatsApp e Google.</p>
          <a className="mt-6 inline-block rounded-[7px] bg-gold px-6 py-3 font-extrabold text-[#3a2708]" href={`${appBase}/registrazione`}>Registra la tua azienda</a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="font-display text-2xl font-extrabold text-deep">Cosa fa per te</h2>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {FUNZIONI.map((f) => <li key={f} className="flex gap-2"><span className="text-ocean">✓</span>{f}</li>)}
        </ul>
        {esempio && (
          <p className="mt-5 text-sm text-muted">
            Guarda un esempio di profilo pubblico:{" "}
            <a className="font-bold text-ocean" href={`/azienda/${esempio.slug}`}>{esempio.nome}</a>
          </p>
        )}
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 py-12 md:grid-cols-3">
          {PASSI.map((p) => (
            <div key={p.n} className="rounded-[18px] border border-[#e9e2d6] bg-white p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-foam font-display font-extrabold text-ocean">{p.n}</span>
              <h3 className="mt-3 font-display text-lg font-bold text-deep">{p.t}</h3>
              <p className="mt-1 text-sm text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="text-center font-display text-3xl font-extrabold text-deep">Domande frequenti</h2>
        <div className="mt-6 grid gap-2">
          {DOMANDE.map((q) => (
            <details key={q.d} className="card p-4">
              <summary className="cursor-pointer list-none font-semibold text-deep">{q.d}</summary>
              <p className="mt-2 text-sm text-muted">{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
