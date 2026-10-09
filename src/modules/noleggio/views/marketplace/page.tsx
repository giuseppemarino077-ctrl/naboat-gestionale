"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUtente } from "@/components/Utente";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { ErroreRecuperabile } from "@/components/ui/ErroreRecuperabile";
import { Icona } from "@/components/ui/Icona";

type Profilo = {
  slug: string | null;
  verificata: boolean;
  descrizione: string | null;
  copertinaUrl: string | null;
  citta: string | null;
  telefonoContatto: string | null;
  mostraTelefono: boolean;
  mostraEmail: boolean;
  mostraRecensioni: boolean;
};

type Dati = {
  profilo: Profilo | null;
  barche: any[];
  richieste: any[];
  recensioni: { sintesi: { media: number; totale: number; senzaRisposta: number } } | null;
  porti: any[];
};

export default function MarketplacePage() {
  const utente = useUtente({ redirect: true });
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");

  const carica = useCallback(async () => {
    setErr("");
    try {
      const [profilo, barche, prenotazioni, recensioni, porti] = await Promise.all([
        fetch("/api/v1/tenant").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v1/boats").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/v1/bookings").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/v1/recensioni").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v1/porti").then((r) => (r.ok ? r.json() : [])),
      ]);
      setDati({
        profilo,
        barche: Array.isArray(barche) ? barche : [],
        richieste: Array.isArray(prenotazioni) ? prenotazioni : [],
        recensioni: recensioni?.sintesi ? recensioni : null,
        porti: Array.isArray(porti) ? porti : [],
      });
    } catch {
      setErr("Non riesco a leggere i dati della presenza pubblica.");
    }
  }, []);
  useEffect(() => {
    carica();
  }, [carica]);

  if (err && !dati) return <ErroreRecuperabile messaggio={err} onRiprova={carica} />;
  if (!dati) return <Caricamento testo="Carico la presenza pubblica…" />;

  const pubblicate = dati.barche.filter((b) => b.pubblicata && !b.archiviato);
  const bozze = dati.barche.filter((b) => !b.pubblicata && !b.archiviato);
  const inPausa = dati.barche.filter((b) => b.inPausa);
  const richiesteDaConfermare = dati.richieste.filter((b) => b.stato === "da_confermare");
  const richiesteNaBoat = dati.richieste.filter((b) => b.origineCanale === "naboat");
  const profilo = dati.profilo;
  const mancanti = profilo
    ? [
        !profilo.descrizione && "descrizione azienda",
        !profilo.copertinaUrl && "foto di copertina",
        !profilo.citta && "città",
        !profilo.telefonoContatto && "telefono di contatto",
      ].filter(Boolean) as string[]
    : [];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Marketplace</p>
          <h1 className="text-2xl">Presenza su NaBoat e richieste</h1>
          <p className="text-sm text-muted">Da qui curi come appari su NaBoat e rispondi alle richieste arrivate dal sito. Il gestionale del sito commerciale non passa da qui.</p>
        </div>
        <a className="btn-soft" href="/" target="_blank" rel="noreferrer">
          <Icona nome="esterno" className="mr-1.5 h-4 w-4" /> Apri sito pubblico
        </a>
      </div>

      {err && <Avviso tono="attenzione">{err}</Avviso>}

      {!profilo?.slug && (
        <Avviso tono="attenzione">
          Il tuo profilo pubblico non ha ancora un indirizzo: il team NaBoat lo assegna in fase di pubblicazione. Nel frattempo puoi completare i dati da <Link className="font-bold underline" href="/gestionale/impostazioni">Impostazioni</Link>.
        </Avviso>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Riquadro icona="barca" titolo="Barche pubblicate" valore={String(pubblicate.length)} nota={`${bozze.length} bozze · ${inPausa.length} in pausa`} href="/gestionale/flotta" azione="Gestisci la flotta" />
        <Riquadro icona="lista" titolo="Richieste da confermare" valore={String(richiesteDaConfermare.length)} nota={`${richiesteNaBoat.length} arrivate da NaBoat in totale`} href="/gestionale/prenotazioni" azione="Apri le prenotazioni" />
        <Riquadro icona="stella" titolo="Recensioni pubblicate" valore={dati.recensioni ? dati.recensioni.sintesi.totale.toLocaleString("it-IT") : "–"} nota={dati.recensioni && dati.recensioni.sintesi.senzaRisposta > 0 ? `${dati.recensioni.sintesi.senzaRisposta} senza risposta` : "Tutte risposte"} href="/gestionale/recensioni" azione="Vedi le recensioni" />
        <Riquadro icona="pin" titolo="Porti collegati" valore={String(dati.porti.length)} nota="Basi operative nelle schede" href="/gestionale/impostazioni/porti" azione="Gestisci i porti" />
      </div>

      <section className="card grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Scheda pubblica dell'azienda</h2>
          {profilo?.slug && (
            <a className="btn-soft" href={`/azienda/${profilo.slug}`} target="_blank" rel="noreferrer">
              <Icona nome="esterno" className="mr-1.5 h-4 w-4" /> Vedi la scheda pubblica
            </a>
          )}
        </div>
        {profilo ? (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Dato etichetta="Indirizzo pubblico" valore={profilo.slug ? `/azienda/${profilo.slug}` : "Da assegnare"} />
              <Dato etichetta="Verificata da NaBoat" valore={profilo.verificata ? "Sì" : "Non ancora"} />
              <Dato etichetta="Telefono visibile" valore={profilo.mostraTelefono && profilo.telefonoContatto ? "Sì" : "No"} />
              <Dato etichetta="Recensioni visibili" valore={profilo.mostraRecensioni ? "Sì" : "No"} />
            </div>
            {mancanti.length > 0 ? (
              <Avviso tono="attenzione">
                Completa il profilo per una scheda più convincente. Manca: <b>{mancanti.join(", ")}</b>.
              </Avviso>
            ) : (
              <Avviso tono="ok">Il profilo pubblico è completo.</Avviso>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Solo il titolare può vedere e modificare i dati del profilo.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary" href="/gestionale/impostazioni">
            Modifica il profilo pubblico
          </Link>
          <Link className="btn-soft" href="/gestionale/impostazioni/listino">
            Listino prezzi
          </Link>
        </div>
      </section>

      <section className="card grid gap-2 p-5">
        <h2 className="text-lg">Richieste dal sito</h2>
        <p className="text-sm text-muted">
          Le richieste inviate dal sito NaBoat arrivano come <b>da confermare</b> e occupano la barca finché l'opzione non scade. Confermale o rifiutale dalle prenotazioni.
        </p>
        {richiesteDaConfermare.length === 0 ? (
          <p className="text-sm text-muted">Nessuna richiesta in attesa: sei in pari.</p>
        ) : (
          <ul className="grid gap-2">
            {richiesteDaConfermare.slice(0, 5).map((b: any) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 text-sm last:border-0">
                <span>
                  <b>{b.clienteNome ?? "Cliente"}</b>
                  <span className="text-muted"> · {b.boat?.nome ?? "barca"} · {new Date(b.startAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>
                </span>
                <Link className="font-bold text-ocean" href={`/gestionale/prenotazioni/${b.id}`}>
                  Apri →
                </Link>
              </li>
            ))}
          </ul>
        )}
        {richiesteDaConfermare.length > 0 && (
          <div>
            <Link className="btn-primary" href="/gestionale/prenotazioni">
              Vai alle prenotazioni
            </Link>
          </div>
        )}
      </section>

      {utente?.tenantStatus === "pending" && (
        <Avviso tono="attenzione">L'azienda non è ancora attiva: la presenza pubblica si sblocca all'approvazione di NaBoat.</Avviso>
      )}
    </div>
  );
}

function Riquadro({
  icona,
  titolo,
  valore,
  nota,
  href,
  azione,
}: {
  icona: "barca" | "lista" | "stella" | "pin";
  titolo: string;
  valore: string;
  nota: string;
  href: string;
  azione: string;
}) {
  return (
    <div className="card grid gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{titolo}</span>
        <Icona nome={icona} className="h-5 w-5 text-ocean" />
      </div>
      <p className="font-display text-3xl font-extrabold">{valore}</p>
      <p className="text-xs text-muted">{nota}</p>
      <Link className="mt-1 text-sm font-bold text-ocean" href={href}>
        {azione} →
      </Link>
    </div>
  );
}

function Dato({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{etichetta}</p>
      <b className="break-all">{valore}</b>
    </div>
  );
}
