"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d?: string | null) => (d ? new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function SchedaPermanenzaPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [dati, setDati] = useState<any>(null);
  const [servizi, setServizi] = useState<any[]>([]);
  const [addetti, setAddetti] = useState<any[]>([]);
  const [posti, setPosti] = useState<any[]>([]);
  const [tab, setTab] = useState<"scheda" | "attivita" | "conto">("scheda");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [nuovaAtt, setNuovaAtt] = useState({ tipo: "", dataPrevista: "", quantita: "", unita: "", prezzoEuro: "", incluso: false, addettoId: "" });
  const [nuovoIncasso, setNuovoIncasso] = useState({ importoEuro: "", metodo: "contanti", descrizione: "" });
  const [nuovoAddebito, setNuovoAddebito] = useState({ descrizione: "", importoEuro: "", origine: "altro" });

  const carica = useCallback(() => {
    fetch(`/api/v1/ormeggio/permanenze/${id}`).then((r) => r.json()).then((j) => { if (j?.id) setDati(j); else setErr(j?.error ?? "Non trovata"); }).catch(() => setErr("Errore"));
  }, [id]);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    fetch("/api/v1/ormeggio/servizi").then((r) => r.json()).then((j) => Array.isArray(j) && setServizi(j)).catch(() => {});
    fetch("/api/v1/users").then((r) => r.json()).then((j) => Array.isArray(j) && setAddetti(j)).catch(() => {});
    fetch("/api/v1/ormeggio/aree").then((r) => r.json()).then((j) => Array.isArray(j) && setPosti(j.flatMap((a: any) => a.posti))).catch(() => {});
  }, []);

  const api = async (url: string, method: string, body?: any) => {
    setErr(""); setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    carica();
    return j;
  };

  const movimento = (tipo: "uscita" | "rientro") => api("/api/v1/ormeggio/movimenti", "POST", { permanenzaId: id, tipo });
  const sposta = () => {
    const codice = prompt("Codice del nuovo posto (es. B3):", dati?.posto?.codice ?? "");
    if (!codice) return;
    const target = posti.find((p: any) => p.codice.toLowerCase() === codice.trim().toLowerCase());
    if (!target) { setErr("Posto non trovato"); return; }
    api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "sposta", postoId: target.id });
  };
  const chiudi = () => confirm("Chiudere definitivamente la sosta? Il posto viene liberato.") && api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "chiudi" });

  const generaContratto = async () => {
    const j = await api(`/api/v1/ormeggio/permanenze/${id}/contratto`, "POST");
    if (j?.link) window.open(j.link, "_blank");
  };
  const apriWhatsapp = () => {
    const tel = dati?.boat?.proprietario?.telefono?.replace(/\D/g, "") ?? "";
    if (!tel) { setErr("Il proprietario non ha un telefono in anagrafica"); return; }
    const testo = prompt("Messaggio WhatsApp (puoi modificarlo):", `Gentile ${dati.boat.proprietario.nome}, la sua barca ${dati.boat.nome} è pronta. Posto ${dati.posto?.codice}.`);
    if (testo === null) return;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(testo)}`, "_blank");
  };

  const aggiungiAttivita = async (e: React.FormEvent) => {
    e.preventDefault();
    const prezzoCent = nuovaAtt.prezzoEuro ? Math.round(Number(nuovaAtt.prezzoEuro.replace(",", ".")) * 100) : null;
    const j = await api("/api/v1/ormeggio/attivita", "POST", {
      permanenzaId: id,
      tipo: nuovaAtt.tipo,
      dataPrevista: nuovaAtt.dataPrevista || null,
      quantita: nuovaAtt.quantita ? Number(nuovaAtt.quantita) : null,
      unita: nuovaAtt.unita || null,
      prezzoCent,
      incluso: nuovaAtt.incluso,
      addettoId: nuovaAtt.addettoId || null,
    });
    if (j) { setMsg("Attività aggiunta."); setNuovaAtt({ tipo: "", dataPrevista: "", quantita: "", unita: "", prezzoEuro: "", incluso: false, addettoId: "" }); }
  };

  const cambiaStatoAtt = (a: any, stato: string) => api(`/api/v1/ormeggio/attivita/${a.id}`, "PATCH", { stato });

  const aggiungiIncasso = async (e: React.FormEvent) => {
    e.preventDefault();
    const cent = Math.round(Number(nuovoIncasso.importoEuro.replace(",", ".")) * 100);
    const j = await api("/api/v1/ormeggio/incassi", "POST", { permanenzaId: id, importoCent: cent, metodo: nuovoIncasso.metodo, descrizione: nuovoIncasso.descrizione || null });
    if (j) { setMsg("Incasso registrato."); setNuovoIncasso({ importoEuro: "", metodo: "contanti", descrizione: "" }); }
  };
  const aggiungiAddebito = async (e: React.FormEvent) => {
    e.preventDefault();
    const cent = Math.round(Number(nuovoAddebito.importoEuro.replace(",", ".")) * 100);
    const j = await api("/api/v1/ormeggio/addebiti", "POST", { permanenzaId: id, descrizione: nuovoAddebito.descrizione, importoCent: cent, origine: nuovoAddebito.origine });
    if (j) { setMsg("Addebito aggiunto."); setNuovoAddebito({ descrizione: "", importoEuro: "", origine: "altro" }); }
  };

  if (!dati) return <div className="grid gap-3"><a className="text-sm font-bold text-ocean" href="/ormeggio">← Griglia</a>{err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}{!err && <p className="text-sm text-muted">Carico la scheda…</p>}</div>;

  const c = dati.conto ?? { totaleAddebitiCent: 0, incassatoCent: 0, residuoCent: 0 };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <a className="text-sm font-bold text-ocean" href="/ormeggio">← Griglia</a>
          <h1 className="text-2xl">{dati.boat?.nome} <span className="text-muted">· posto {dati.posto?.codice}</span></h1>
          <p className="text-sm text-muted">{dati.boat?.proprietario?.nome ?? "proprietario non indicato"} · {dati.posto?.area?.nome} · {dati.stato === "attiva" ? "sosta attiva" : "sosta chiusa"}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" onClick={() => movimento("uscita")}>↗ Registra uscita</button>
          <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" onClick={() => movimento("rientro")}>↙ Registra rientro</button>
          <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" onClick={sposta}>⇄ Sposta</button>
          <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" onClick={generaContratto}>📄 Contratto</button>
          <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" onClick={apriWhatsapp}>✆ WhatsApp</button>
          <a className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" href={`/api/v1/ormeggio/permanenze/${id}/riepilogo`}>⬇ Riepilogo PDF</a>
          {dati.stato === "attiva" && <button className="rounded-[7px] border border-line px-3 py-2 font-bold text-coral" onClick={chiudi}>Chiudi sosta</button>}
        </div>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="flex gap-2 text-sm">
        {(["scheda", "attivita", "conto"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 font-bold ${tab === t ? "bg-deep text-white" : "border border-line bg-white text-muted"}`}>
            {t === "scheda" ? "Scheda" : t === "attivita" ? "Attività" : "Conto"}
          </button>
        ))}
      </div>

      {tab === "scheda" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card grid gap-2 p-4 text-sm">
            <h2 className="text-lg">Sosta</h2>
            <p>Proprietario: <b>{dati.boat?.proprietario?.nome ?? "—"}</b> {dati.boat?.proprietario?.telefono ? `· ${dati.boat.proprietario.telefono}` : ""}</p>
            <p>Barca: <b>{dati.boat?.nome}</b> {dati.boat?.tipo ? `(${dati.boat.tipo})` : ""}</p>
            <p>Posto: <b>{dati.posto?.codice}</b> · {dati.posto?.area?.nome}</p>
            <p>Tipo: <b>{dati.tipo === "rimessaggio_custodia" ? "Rimessaggio (custodia)" : "Ormeggio (custodia)"}</b></p>
            <p>Inizio: <b>{dataIt(dati.inizioAt)}</b></p>
            <p>Fine prevista: <b>{dati.finePrevistaAt ? dataIt(dati.finePrevistaAt) : "indeterminata"}</b>{dati.fineAt ? ` · chiusa il ${dataIt(dati.fineAt)}` : ""}</p>
            <p>Corrispettivo: <b>{dati.corrispettivoCent != null ? euro(dati.corrispettivoCent) : "da definire"}</b></p>
            <p>Contratto: <b>{dati.contratto ? (dati.contratto.firmatoAt ? `firmato da ${dati.contratto.firmaNome} il ${dataIt(dati.contratto.firmatoAt)}` : "in attesa di firma") : "non ancora generato"}</b></p>
          </div>
          <div className="card grid gap-2 p-4 text-sm">
            <h2 className="text-lg">Movimenti</h2>
            {dati.movimenti.length === 0 && <p className="text-muted">Nessun movimento.</p>}
            {dati.movimenti.map((m: any) => (
              <p key={m.id}>{m.tipo.replace("_", " ")} · <b>{dataIt(m.effettivoAt ?? m.previstoAt)}</b>{m.note ? ` · ${m.note}` : ""}</p>
            ))}
            <p className="mt-2 text-muted">La barca in mare mantiene il posto. La chiusura definitiva libera il posto.</p>
          </div>
        </div>
      )}

      {tab === "attivita" && (
        <div className="grid gap-4">
          <form className="card grid gap-3 p-4 text-sm md:grid-cols-12 md:items-end" onSubmit={aggiungiAttivita}>
            <label className="grid gap-1 md:col-span-3"><span className="text-xs font-semibold text-muted">Servizio / lavoro *</span>
              <input list="servizi" className="rounded-md border border-line p-2" placeholder="es. Lavaggio" value={nuovaAtt.tipo} onChange={(e) => setNuovaAtt({ ...nuovaAtt, tipo: e.target.value })} required />
              <datalist id="servizi">{servizi.map((s) => <option key={s.id} value={s.nome} />)}</datalist>
            </label>
            <label className="grid gap-1 md:col-span-2"><span className="text-xs font-semibold text-muted">Data prevista</span>
              <input type="date" className="rounded-md border border-line p-2" value={nuovaAtt.dataPrevista} onChange={(e) => setNuovaAtt({ ...nuovaAtt, dataPrevista: e.target.value })} />
            </label>
            <label className="grid gap-1 md:col-span-1"><span className="text-xs font-semibold text-muted">Qtà</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.quantita} onChange={(e) => setNuovaAtt({ ...nuovaAtt, quantita: e.target.value })} placeholder="40" />
            </label>
            <label className="grid gap-1 md:col-span-1"><span className="text-xs font-semibold text-muted">Unità</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.unita} onChange={(e) => setNuovaAtt({ ...nuovaAtt, unita: e.target.value })} placeholder="litri" />
            </label>
            <label className="grid gap-1 md:col-span-2"><span className="text-xs font-semibold text-muted">Prezzo € / unità</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.prezzoEuro} onChange={(e) => setNuovaAtt({ ...nuovaAtt, prezzoEuro: e.target.value })} placeholder="1,80" />
            </label>
            <label className="flex items-center gap-2 pb-2 md:col-span-2"><input type="checkbox" checked={nuovaAtt.incluso} onChange={(e) => setNuovaAtt({ ...nuovaAtt, incluso: e.target.checked })} /> incluso nella custodia</label>
            <div className="md:col-span-1"><button className="btn-primary w-full" type="submit">＋</button></div>
          </form>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left"><th className="p-2">Servizio</th><th className="p-2">Data</th><th className="p-2">Qtà</th><th className="p-2">Prezzo</th><th className="p-2">Incluso</th><th className="p-2">Stato</th><th className="p-2">Azioni</th></tr></thead>
              <tbody>
                {dati.attivita.map((a: any) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="p-2 font-semibold">{a.tipo}</td>
                    <td className="p-2">{a.dataPrevista ? new Date(a.dataPrevista).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="p-2">{a.quantita ?? "—"}{a.unita ? ` ${a.unita}` : ""}</td>
                    <td className="p-2">{a.prezzoCent != null ? euro(a.prezzoCent) : "—"}</td>
                    <td className="p-2">{a.incluso ? "sì" : "no"}</td>
                    <td className="p-2">
                      <span className={a.stato === "completato" ? "badge-ready" : a.stato === "in_corso" ? "badge-pending" : "badge-block"}>{a.stato.replace("_", " ")}</span>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2 font-bold">
                        {a.stato === "da_fare" && <button className="text-ocean" onClick={() => cambiaStatoAtt(a, "in_corso")}>Avvia</button>}
                        {a.stato === "in_corso" && <button className="text-[#177469]" onClick={() => cambiaStatoAtt(a, "completato")}>Completa</button>}
                        {a.stato === "completato" && <button className="text-muted" onClick={() => cambiaStatoAtt(a, "in_corso")}>Riapri</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {dati.attivita.length === 0 && <tr><td className="p-3 text-muted" colSpan={7}>Nessuna attività.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "conto" && (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-4"><p className="text-xs text-muted">TOTALE ADDEBITATO</p><p className="text-2xl font-bold">{euro(c.totaleAddebitiCent)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted">INCASSATO</p><p className="text-2xl font-bold text-[#177469]">{euro(c.incassatoCent)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted">RESIDUO</p><p className={`text-2xl font-bold ${c.residuoCent > 0 ? "text-coral" : "text-[#177469]"}`}>{euro(c.residuoCent)}</p></div>
          </div>

          <form className="card grid gap-2 p-3 text-sm md:grid-cols-4" onSubmit={aggiungiAddebito}>
            <input className="rounded-md border border-line p-2 md:col-span-2" placeholder="Descrizione addebito (es. Lavaggio)" value={nuovoAddebito.descrizione} onChange={(e) => setNuovoAddebito({ ...nuovoAddebito, descrizione: e.target.value })} required />
            <input className="rounded-md border border-line p-2" placeholder="Importo €" value={nuovoAddebito.importoEuro} onChange={(e) => setNuovoAddebito({ ...nuovoAddebito, importoEuro: e.target.value })} required />
            <button className="btn-primary" type="submit">＋ Addebito</button>
          </form>

          <div className="card overflow-x-auto">
            <div className="border-b border-line p-3 text-sm font-bold">Addebiti</div>
            <table className="w-full text-sm">
              <tbody>
                {dati.addebiti.map((a: any) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="p-2">{a.descrizione}</td>
                    <td className="p-2 text-muted">{a.origine}</td>
                    <td className="p-2">{new Date(a.data).toLocaleDateString("it-IT")}</td>
                    <td className="p-2 font-bold">{euro(a.importoCent)}</td>
                    <td className="p-2"><span className={a.stato === "pagato" ? "badge-ready" : "badge-pending"}>{a.stato.replace("_", " ")}</span></td>
                    <td className="p-2">{a.stato !== "pagato" && <button className="font-bold text-ocean" onClick={() => api(`/api/v1/ormeggio/addebiti/${a.id}`, "PATCH", { stato: "pagato" })}>Segna pagato</button>}</td>
                  </tr>
                ))}
                {dati.addebiti.length === 0 && <tr><td className="p-3 text-muted">Nessun addebito.</td></tr>}
              </tbody>
            </table>
          </div>

          <form className="card grid gap-2 p-3 text-sm md:grid-cols-4" onSubmit={aggiungiIncasso}>
            <input className="rounded-md border border-line p-2" placeholder="Importo incassato €" value={nuovoIncasso.importoEuro} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, importoEuro: e.target.value })} required />
            <select className="rounded-md border border-line p-2" value={nuovoIncasso.metodo} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, metodo: e.target.value })}>
              <option value="contanti">Contanti</option><option value="pos">POS</option><option value="bonifico">Bonifico</option>
            </select>
            <input className="rounded-md border border-line p-2" placeholder="Nota" value={nuovoIncasso.descrizione} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, descrizione: e.target.value })} />
            <button className="btn-primary" type="submit">＋ Incasso esterno</button>
          </form>

          <div className="card overflow-x-auto">
            <div className="border-b border-line p-3 text-sm font-bold">Incassi</div>
            <table className="w-full text-sm">
              <tbody>
                {dati.payments.map((p: any) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="p-2">{new Date(p.createdAt).toLocaleDateString("it-IT")}</td>
                    <td className="p-2 text-muted">{p.provider} · {p.metodo}</td>
                    <td className="p-2 font-bold">{euro(p.totaleCent)}</td>
                    <td className="p-2"><span className={p.stato === "pagato" ? "badge-ready" : "badge-pending"}>{p.stato}</span></td>
                  </tr>
                ))}
                {dati.payments.length === 0 && <tr><td className="p-3 text-muted">Nessun incasso registrato.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">L'addebito è la voce da pagare; l'incasso è il denaro ricevuto. Un pagamento online (fase O4) aggiornerà il conto automaticamente.</p>
        </div>
      )}
    </div>
  );
}
