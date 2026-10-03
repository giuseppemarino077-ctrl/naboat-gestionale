"use client";
import { useEffect, useRef, useState } from "react";
import { istante } from "@/lib/calendario";
import { uuidSicuro } from "@/lib/browser";
import type { PlanningBoat, PlanningOfferta } from "@/lib/planning";

const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

// Form rapido di creazione dalla cella libera (BOATLY): pochi campi, con le
// salvaguardie NaBoat in una sezione secondaria (prezzo/sede/skipper).
export default function FormCellaNuova({
  boat, giorno, offerte, porti, skippers, busy, onCrea, onBlocca,
}: {
  boat: PlanningBoat;
  giorno: string;
  offerte: PlanningOfferta[];
  porti: { id: string; nome: string }[];
  skippers: { id: string; nome: string; telefono?: string | null }[];
  busy: boolean;
  oggi: string;
  onCrea: (payload: Record<string, unknown>) => Promise<boolean>;
  onBlocca: (motivo: string, manutenzione: boolean, orario?: { dalle: string; alle: string }) => Promise<boolean>;
}) {
  const [dalle, setDalle] = useState("09:00");
  const [alle, setAlle] = useState("17:00");
  const [passeggeri, setPasseggeri] = useState(1);
  const [offertaId, setOffertaId] = useState("");
  const [portoId, setPortoId] = useState(boat.portoId ?? "");
  const [nome, setNome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [patente, setPatente] = useState<"" | "YES" | "NO">("");
  const [skipper, setSkipper] = useState("NONE");
  const [nuovoSkipper, setNuovoSkipper] = useState({ nome: "", telefono: "", note: "" });
  const [note, setNote] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [prezzoDaDefinire, setPrezzoDaDefinire] = useState(false);
  const [errore, setErrore] = useState("");
  const [bloccoMotivo, setBloccoMotivo] = useState("");
  const [bloccoManutenzione, setBloccoManutenzione] = useState(false);
  const [bloccoDalle, setBloccoDalle] = useState("09:00");
  const [bloccoAlle, setBloccoAlle] = useState("17:00");
  const [clienteNoto, setClienteNoto] = useState<{ nome: string; telefono: string | null; email: string | null } | null>(null);
  const idem = useRef(uuidSicuro());

  // Cliente già in anagrafica: digitando il nome si completano telefono/email.
  useEffect(() => {
    const nomeCercato = nome.trim();
    if (nomeCercato.length < 3) { setClienteNoto(null); return; }
    let attivo = true;
    const t = window.setTimeout(() => {
      fetch(`/api/v1/customers?q=${encodeURIComponent(nomeCercato)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((j) => {
          if (!attivo) return;
          const lista: Array<{ nome?: string; telefono?: string | null; email?: string | null }> = Array.isArray(j) ? j : j?.items ?? [];
          const match = lista.find((c) => (c.nome ?? "").trim().toLowerCase() === nomeCercato.toLowerCase());
          if (!match) { setClienteNoto(null); return; }
          setClienteNoto({ nome: match.nome ?? nomeCercato, telefono: match.telefono ?? null, email: match.email ?? null });
          if (match.telefono) setTelefono((prev) => (prev ? prev : match.telefono!));
          if (match.email) setEmail((prev) => (prev ? prev : match.email!));
        })
        .catch(() => {});
    }, 400);
    return () => { attivo = false; window.clearTimeout(t); };
  }, [nome]);

  // Prezzo proposto dal listino della barca (dati anagrafici), modificabile.
  useEffect(() => {
    let attivo = true;
    fetch(`/api/v1/tariffe?boatId=${encodeURIComponent(boat.id)}&data=${encodeURIComponent(giorno)}&tipo=giornata`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (attivo && j?.prezzoCent != null) setPrezzo((p) => (p ? p : (j.prezzoCent / 100).toFixed(2).replace(".", ",")));
      })
      .catch(() => {});
    return () => { attivo = false; };
  }, [boat.id, giorno]);

  const skipperMandatory = boat.patenteRichiesta && patente === "NO";
  const navigationIncomplete = boat.patenteRichiesta && !patente;
  const skipperIncomplete = skipperMandatory && !(skipper.startsWith("EXISTING:") || skipper === "NEW") ;
  const puoSalvare = !navigationIncomplete && !skipperIncomplete && nome.trim().length >= 2 && !(busy);

  function changePatente(next: "YES" | "NO") {
    setPatente(next);
    if (next === "NO" && (skipper === "NONE" || skipper === "UNASSIGNED")) setSkipper("");
    else if (next === "YES" && !skipper) setSkipper("NONE");
  }

  async function invia() {
    setErrore("");
    if (nome.trim().length < 2) { setErrore("Inserisci il nome del cliente."); return; }
    const tel = telefono.replace(/\D/g, "");
    if (telefono && (tel.length < 8 || tel.length > 15)) { setErrore("Il telefono deve contenere da 8 a 15 cifre."); return; }
    const start = istante(giorno, dalle);
    const end = istante(giorno, alle);
    if (!(start < end)) { setErrore("L'orario di fine deve essere successivo all'inizio."); return; }

    const payload: Record<string, unknown> = {
      boatId: boat.id,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      passeggeri: Number(passeggeri),
      clienteNome: nome.trim(),
      telefono: telefono ? `+${tel}` : null,
      email: email || null,
      note: note || undefined,
      offertaId: offertaId || null,
      portoId: portoId || null,
      stato: "prenotata",
      prezzoEuro: prezzo ? prezzo : null,
      prezzoDaDefinire: prezzoDaDefinire || undefined,
      idempotencyKey: idem.current,
    };
    if (boat.patenteRichiesta) payload.patenteRisposta = patente || null;
    if (skipper === "NEW") {
      payload.nuovoSkipper = { nome: nuovoSkipper.nome, telefono: nuovoSkipper.telefono ? `+${nuovoSkipper.telefono.replace(/\D/g, "")}` : null, note: nuovoSkipper.note || null };
      payload.skipperStato = "ASSIGNED";
    } else if (skipper.startsWith("EXISTING:")) {
      payload.skipperId = skipper.slice("EXISTING:".length);
      payload.skipperStato = "ASSIGNED";
    } else if (skipper === "UNASSIGNED") {
      payload.skipperStato = "UNASSIGNED";
    } else {
      payload.skipperStato = "NONE";
    }

    const ok = await onCrea(payload);
    idem.current = uuidSicuro();
    return ok;
  }

  return (
    <div className="space-y-4">
      <details open className="rounded-2xl border border-[#a9d8d5] bg-white p-4">
        <summary className="cursor-pointer rounded-lg px-1 py-2 text-base font-semibold text-ocean hover:bg-foam">+ Crea prenotazione</summary>
        <div className="mt-4 grid gap-4 border-t border-line pt-4">
          {errore && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm font-medium text-danger">{errore}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">Partenza *<input type="time" value={dalle} onChange={(e) => setDalle(e.target.value)} className={campo} /></label>
            <label className="grid gap-2 text-sm font-semibold">Rientro *<input type="time" value={alle} onChange={(e) => setAlle(e.target.value)} className={campo} /></label>
            <label className="grid gap-2 text-sm font-semibold">Passeggeri *<input type="number" min={1} max={boat.capienza ?? undefined} value={passeggeri} onChange={(e) => setPasseggeri(Number(e.target.value))} className={campo} /></label>
            {offerte.length > 0 && (
              <label className="grid gap-2 text-sm font-semibold">Modalità <span className="font-normal text-muted">(facoltativa)</span>
                <select value={offertaId} onChange={(e) => setOffertaId(e.target.value)} className={campo}>
                  <option value="">Usa la modalità predefinita</option>
                  {offerte.map((o) => <option key={o.id} value={o.id}>{o.codice.replaceAll("_", " ").toLowerCase()}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-sand p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">Nome cliente *<input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} maxLength={160} autoComplete="name" className={campo} /></label>
              <label className="grid gap-2 text-sm font-semibold">Telefono <span className="font-normal text-muted">(facoltativo)</span><input type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={campo} /></label>
              <label className="grid gap-2 text-sm font-semibold">Email <span className="font-normal text-muted">(facoltativa)</span><input type="email" maxLength={320} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} /></label>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">Scrivi sempre il nome. Se aggiungi un contatto già noto, NaBoat riconosce automaticamente la persona.</p>
            {clienteNoto && (
              <p className="mt-2 rounded-xl border border-ok-line bg-ok-soft p-3 text-xs leading-5 text-ok">
                Cliente riconosciuto in anagrafica{clienteNoto.telefono ? "" : " (nessun telefono salvato)"}: telefono ed email vengono allineati ai dati già registrati.
              </p>
            )}
          </div>

          {boat.patenteRichiesta ? (
            <fieldset className="rounded-2xl border border-warn-line bg-warn-soft p-4">
              <legend className="px-1 text-sm font-semibold text-ink">Il cliente ha la patente nautica? *</legend>
              <p className="mt-1 text-xs leading-5 text-warn">Questa imbarcazione richiede la patente. La risposta determina se lo skipper è obbligatorio.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(["YES", "NO"] as const).map((v) => (
                  <label key={v} className={"flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold " + (patente === v ? "border-ocean bg-white text-ocean ring-2 ring-ocean/15" : "border-warn-line bg-white/70 text-ink hover:border-ocean")}>
                    <input type="radio" className="sr-only" checked={patente === v} onChange={() => changePatente(v)} />
                    {v === "YES" ? "Sì, ce l'ha" : "No, non ce l'ha"}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="rounded-xl bg-ok-soft p-3 text-xs font-medium text-ok">Per questa barca la patente nautica non è richiesta.</div>
          )}

          <div className="rounded-2xl border border-line bg-white p-4">
            <label className="grid gap-2 text-sm font-semibold">
              Skipper <span className={"font-normal " + (skipperMandatory ? "text-danger" : "text-muted")}>{skipperMandatory ? "(obbligatorio)" : "(facoltativo)"}</span>
              <select value={skipper} onChange={(e) => setSkipper(e.target.value)} className={campo}>
                {skipperMandatory && <option value="">Seleziona o aggiungi uno skipper</option>}
                {!skipperMandatory && <option value="NONE">Nessuno · non serve</option>}
                {!skipperMandatory && <option value="UNASSIGNED">Da assegnare</option>}
                {skippers.map((s) => <option key={s.id} value={`EXISTING:${s.id}`}>{s.nome}{s.telefono ? ` · ${s.telefono}` : ""}</option>)}
                <option value="NEW">+ Aggiungi uno skipper</option>
              </select>
            </label>
            {skipperMandatory && <p className="mt-3 rounded-xl bg-danger-soft p-3 text-xs font-medium leading-5 text-danger">Senza patente del cliente, la prenotazione si salva solo con uno skipper già assegnato.</p>}
            {skipper === "UNASSIGNED" && <p className="mt-3 rounded-xl bg-warn-soft p-3 text-xs leading-5 text-warn">La prenotazione viene salvata subito e il cruscotto Oggi ricorderà di assegnare uno skipper.</p>}
            {skipper === "NEW" && (
              <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">Nome skipper *<input value={nuovoSkipper.nome} onChange={(e) => setNuovoSkipper({ ...nuovoSkipper, nome: e.target.value })} minLength={2} maxLength={160} className={campo} /></label>
                <label className="grid gap-2 text-sm font-semibold">Telefono <span className="font-normal text-muted">(facoltativo)</span><input type="tel" value={nuovoSkipper.telefono} onChange={(e) => setNuovoSkipper({ ...nuovoSkipper, telefono: e.target.value })} className={campo} /></label>
                <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Nota sullo skipper <span className="font-normal text-muted">(facoltativa)</span><textarea rows={2} maxLength={2000} value={nuovoSkipper.note} onChange={(e) => setNuovoSkipper({ ...nuovoSkipper, note: e.target.value })} className={campo + " py-3"} /></label>
              </div>
            )}
          </div>

          <label className="grid gap-2 text-sm font-semibold">Nota opzionale<textarea rows={3} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} className={campo + " py-3"} placeholder="Itinerario, richieste, promemoria…" /></label>

          <details className="rounded-2xl border border-line bg-white p-4">
            <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-ocean">Prezzo e sede (NaBoat)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold">Prezzo €<input value={prezzo} onChange={(e) => { setPrezzo(e.target.value); if (e.target.value) setPrezzoDaDefinire(false); }} placeholder="es. 350,00" className={campo} /></label>
              <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm sm:col-span-2">
                <input type="checkbox" checked={prezzoDaDefinire} onChange={(e) => setPrezzoDaDefinire(e.target.checked)} />
                Prezzo da definire (nessun incasso finché non è impostato)
              </label>
              {porti.length > 0 && (
                <label className="grid gap-2 text-sm font-semibold sm:col-span-3">Sede
                  <select value={portoId} onChange={(e) => setPortoId(e.target.value)} className={campo}>
                    <option value="">Usa la sede della barca</option>
                    {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
              )}
            </div>
          </details>

          <div className="flex justify-end">
            <button type="button" disabled={!puoSalvare} onClick={invia} className="min-h-12 rounded-xl bg-signature px-5 text-sm font-semibold text-deep disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? "Controllo disponibilità…" : "Crea prenotazione"}
            </button>
          </div>
        </div>
      </details>

      <details className="rounded-2xl border border-line bg-white p-4">
        <summary className="cursor-pointer rounded-lg px-1 py-2 text-base font-semibold text-ink hover:bg-foam">Rendi non disponibile</summary>
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-xs leading-5 text-muted">Di default il blocco copre l&apos;intera giornata: non sarà possibile aggiungere prenotazioni su questa barca quel giorno.</p>
          <label className="flex items-center gap-2 rounded-xl border border-warn-line bg-warn-soft p-3 text-sm font-semibold">
            <input type="checkbox" checked={bloccoManutenzione} onChange={(e) => setBloccoManutenzione(e.target.checked)} />
            Manutenzione programmata (crea anche un intervento in Manutenzione)
          </label>
          {bloccoManutenzione && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">Dalle<input type="time" value={bloccoDalle} onChange={(e) => setBloccoDalle(e.target.value)} className={campo} /></label>
              <label className="grid gap-2 text-sm font-semibold">Alle<input type="time" value={bloccoAlle} onChange={(e) => setBloccoAlle(e.target.value)} className={campo} /></label>
            </div>
          )}
          <label className="grid gap-2 text-sm font-semibold">Altro<textarea rows={3} maxLength={1000} value={bloccoMotivo} onChange={(e) => setBloccoMotivo(e.target.value)} className={campo + " py-3"} placeholder="Note sull'indisponibilità…" /></label>
          <button
            type="button"
            disabled={busy || (bloccoManutenzione && !(bloccoDalle < bloccoAlle))}
            onClick={() => onBlocca(bloccoMotivo, bloccoManutenzione, bloccoManutenzione ? { dalle: bloccoDalle, alle: bloccoAlle } : undefined)}
            className="min-h-12 w-full rounded-xl border border-[#a9d8d5] bg-foam px-4 text-sm font-semibold text-ocean disabled:opacity-50"
          >
            {bloccoManutenzione ? "Blocca per la manutenzione indicata" : "Rendi non disponibile per l'intera giornata"}
          </button>
        </div>
      </details>
    </div>
  );
}
