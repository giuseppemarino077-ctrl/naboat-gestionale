"use client";
import { copiaTesto } from "@/lib/browser";
import { useUtente } from "@/components/Utente";
import { useEffect, useState } from "react";

type Imp = {
  pagamentiAttivi: boolean;
  pagamentiBloccatiNaBoat: boolean;
  stripeAttivo: boolean;
  stripeConfigurato: boolean;
  webhookConfigurato: boolean;
  stripePublicKey: string | null;
  paypalAttivo: boolean;
  moduloMarketplace: boolean;
  feeNaboatPct: number;
  feeProviderPct: number;
  feeProviderFixedCent: number;
  accontoPct: number;
  rimborsoPct: number;
  rimborsoOreMinime: number;
};
type Payment = {
  id: string; provider: string; tipo: string; importoCent: number; feeNaboatCent: number;
  totaleCent: number; stato: string; metodo: string | null; rimborsoCent: number; createdAt: string;
  booking?: { id: string; startAt: string; clienteNome: string | null; boat: { nome: string } } | null;
};
type Booking = { id: string; startAt: string; clienteNome: string | null; prezzoCent: number | null; boat?: { nome: string } };

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function PagamentiPage() {
  const utente = useUtente();
  const sonoProprietario = utente?.role === "owner" || utente?.role === "superadmin";
  const [imp, setImp] = useState<Imp | null>(null);
  const [lista, setLista] = useState<Payment[]>([]);
  const [pren, setPren] = useState<Booking[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [chiavi, setChiavi] = useState({ stripeSecretKey: "", stripeWebhookSecret: "", stripePublicKey: "" });
  const [manuale, setManuale] = useState({ bookingId: "", importoEuro: "", metodo: "contanti", tipo: "totale", descrizione: "" });
  const [cauzioni, setCauzioni] = useState<any[]>([]);
  const [link, setLink] = useState("");

  const load = () => {
    // Le impostazioni (chiavi e percentuali) sono del proprietario: agli altri non si mostrano.
    if (sonoProprietario) {
      fetch("/api/v1/payments/settings")
        .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setImp(j); })
        .catch((e) => setErr(e.message ?? "Impostazioni non disponibili"));
    }
    fetch("/api/v1/payments").then((r) => r.json()).then((j) => Array.isArray(j) && setLista(j)).catch(() => {});
    fetch("/api/v1/bookings").then((r) => r.json()).then((j) => Array.isArray(j) && setPren(j)).catch(() => {});
    fetch("/api/v1/payments/cauzione").then((r) => r.json()).then((j) => Array.isArray(j) && setCauzioni(j)).catch(() => {});
  };
  useEffect(() => { if (utente !== undefined) load(); }, [utente]);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const set = (patch: Partial<Imp>) => api("/api/v1/payments/settings", "PATCH", patch);

  const salvaChiavi = async () => {
    const body: any = {};
    if (chiavi.stripeSecretKey) body.stripeSecretKey = chiavi.stripeSecretKey;
    if (chiavi.stripeWebhookSecret) body.stripeWebhookSecret = chiavi.stripeWebhookSecret;
    if (chiavi.stripePublicKey) body.stripePublicKey = chiavi.stripePublicKey;
    if (!Object.keys(body).length) { setErr("Nessuna chiave da salvare"); return; }
    const r = await api("/api/v1/payments/settings", "PATCH", body);
    if (r) { setChiavi({ stripeSecretKey: "", stripeWebhookSecret: "", stripePublicKey: "" }); setMsg("Chiavi salvate (cifrate)."); }
  };

  const generaLink = async (bookingId: string) => {
    const j = await api("/api/v1/payments/checkout", "POST", { bookingId });
    if (j?.url) { setLink(j.url); setMsg("Link generato: copialo e invialo al cliente."); }
  };

  const registraIncasso = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/v1/payments", "POST", { ...manuale, bookingId: manuale.bookingId || undefined });
    if (r) { setManuale({ bookingId: "", importoEuro: "", metodo: "contanti", tipo: "totale", descrizione: "" }); setMsg("Incasso registrato."); }
  };

  const rimborsa = async (p: Payment, completo: boolean) => {
    const testo = completo ? "Rimborsare l'intero importo?" : "Applicare il rimborso secondo la regola configurata?";
    if (!confirm(testo)) return;
    const r = await api(`/api/v1/payments?id=${p.id}`, "PATCH", { azione: "rimborso", completo });
    if (r) setMsg(r.stato === "rimborsato" ? "Rimborso totale eseguito." : "Rimborso parziale eseguito.");
  };

  const avviaCauzione = async (c: any) => {
    const importo = prompt(`Importo cauzione in euro per ${c.clienteNome ?? "il cliente"}:`, c.cauzioneCent ? (c.cauzioneCent / 100).toFixed(2).replace(".", ",") : "500,00");
    if (importo === null) return;
    const r = await api("/api/v1/payments/cauzione", "POST", { bookingId: c.id, cauzioneEuro: importo });
    if (r?.url) { setLink(r.url); await copiaTesto(r.url); setMsg("Link cauzione copiato: invialo al cliente per il blocco sulla carta."); }
  };

  const cauzioneAzione = async (c: any, azione: "rilascia" | "addebita") => {
    let importo: string | undefined;
    if (azione === "addebita") {
      const v = prompt("Importo da addebitare in euro:", c.danniCent ? (c.danniCent / 100).toFixed(2).replace(".", ",") : (c.cauzioneCent / 100).toFixed(2).replace(".", ","));
      if (v === null) return;
      importo = v;
    } else if (!confirm("Rilasciare la cauzione? Il blocco viene annullato.")) return;
    const r = await api(`/api/v1/payments/cauzione?id=${c.id}`, "PATCH", { azione, importoEuro: importo ?? null });
    if (r) setMsg(azione === "rilascia" ? "Cauzione rilasciata." : "Cauzione addebitata e registrata tra gli incassi.");
  };

  const badge = (s: string) =>
    s === "pagato" ? "badge-ready" : s === "in_attesa" ? "badge-pending" : "badge-block";

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Pagamenti</p>
        <h1 className="text-2xl">Incassi online, accesi quando vuoi.</h1>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {imp && sonoProprietario && (
        <div className="card grid gap-3 p-5 text-sm">
          <h2 className="text-lg">Impostazioni dell'azienda</h2>
          {imp.pagamentiBloccatiNaBoat && (
            <p className="rounded-md bg-[#fdece7] p-2 font-semibold text-coral">Pagamenti sospesi da NaBoat. Contatta l'assistenza.</p>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={imp.pagamentiAttivi} disabled={imp.pagamentiBloccatiNaBoat} onChange={(e) => set({ pagamentiAttivi: e.target.checked })} />
            <b>Pagamenti online attivi</b>
          </label>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={imp.stripeAttivo} onChange={(e) => set({ stripeAttivo: e.target.checked })} /> Stripe
              {imp.stripeConfigurato ? <span className="badge-ready">configurato</span> : <span className="badge-pending">da configurare</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={imp.paypalAttivo} onChange={(e) => set({ paypalAttivo: e.target.checked })} /> PayPal
              <span className="badge-block">in arrivo</span>
            </label>
            <label className="flex items-center gap-2">
              Webhook {imp.webhookConfigurato ? <span className="badge-ready">configurato</span> : <span className="badge-pending">da configurare</span>}
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <label className="grid gap-1">Acconto %<input className="rounded-md border border-line p-2" type="number" min={0} max={100} value={imp.accontoPct} onChange={(e) => set({ accontoPct: Number(e.target.value) })} /></label>
            <label className="grid gap-1">Commissione fornitore %<input className="rounded-md border border-line p-2" type="number" min={0} max={20} step={0.1} value={imp.feeProviderPct} onChange={(e) => set({ feeProviderPct: Number(e.target.value) })} /></label>
            <label className="grid gap-1">Quota fissa fornitore (cent)<input className="rounded-md border border-line p-2" type="number" min={0} max={5000} value={imp.feeProviderFixedCent} onChange={(e) => set({ feeProviderFixedCent: Number(e.target.value) })} /></label>
            <label className="grid gap-1">Rimborso %<input className="rounded-md border border-line p-2" type="number" min={0} max={100} value={imp.rimborsoPct} onChange={(e) => set({ rimborsoPct: Number(e.target.value) })} /></label>
            <label className="grid gap-1">Rimborso entro (ore prima)<input className="rounded-md border border-line p-2" type="number" min={0} max={720} value={imp.rimborsoOreMinime} onChange={(e) => set({ rimborsoOreMinime: Number(e.target.value) })} /></label>
            <div className="grid gap-1">
              <span>Fee NaBoat (impostata da NaBoat)</span>
              <b className="rounded-md border border-line bg-[#f7f4ee] p-2">
                {imp.moduloMarketplace ? `${imp.feeNaboatPct}% sulle prenotazioni dal canale NaBoat` : "modulo Marketplace non attivo"}
              </b>
            </div>
          </div>
          <p className="text-xs text-muted">
            La fee NaBoat si applica <b>solo</b> alle prenotazioni che arrivano dal canale NaBoat, se il modulo Marketplace è attivo per la tua
            azienda. Sulle prenotazioni dirette non c'è nessuna fee. Al cliente la commissione appare come voce unica «Commissioni di servizio».
          </p>

          <h3 className="mt-2 font-bold text-deep">Chiavi Stripe (salvate cifrate)</h3>
          <div className="grid gap-2 md:grid-cols-3">
            <input className="rounded-md border border-line p-2" type="password" placeholder="Chiave segreta sk_…" value={chiavi.stripeSecretKey} onChange={(e) => setChiavi({ ...chiavi, stripeSecretKey: e.target.value })} />
            <input className="rounded-md border border-line p-2" type="password" placeholder="Segreto webhook whsec_…" value={chiavi.stripeWebhookSecret} onChange={(e) => setChiavi({ ...chiavi, stripeWebhookSecret: e.target.value })} />
            <input className="rounded-md border border-line p-2" placeholder="Chiave pubblica pk_… (facoltativa)" value={chiavi.stripePublicKey} onChange={(e) => setChiavi({ ...chiavi, stripePublicKey: e.target.value })} />
          </div>
          <button className="btn-primary w-fit" onClick={salvaChiavi}>Salva chiavi</button>
          <p className="text-xs text-muted">Le chiavi segrete non vengono mai mostrate: una volta salvate restano cifrate nel database.</p>
        </div>
      )}

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Link di pagamento</h2>
        <p className="text-muted">Scegli una prenotazione e genera il link da inviare al cliente (WhatsApp o email).</p>
        <div className="grid gap-2 md:grid-cols-2">
          <select className="rounded-md border border-line p-2" value={manuale.bookingId} onChange={(e) => setManuale({ ...manuale, bookingId: e.target.value })}>
            <option value="">Prenotazione…</option>
            {pren.map((b) => (
              <option key={b.id} value={b.id}>
                {new Date(b.startAt).toLocaleDateString("it-IT")} · {b.clienteNome ?? "cliente"} {b.prezzoCent ? `· ${euro(b.prezzoCent)}` : "· prezzo mancante"}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!manuale.bookingId} onClick={() => generaLink(manuale.bookingId)}>Genera link di pagamento</button>
        </div>
        {link && (
          <div className="grid gap-1">
            <code className="break-all rounded bg-[#3a2418] p-2 text-[#f6e3d5]">{link}</code>
            <button className="w-fit text-sm font-bold text-ocean" onClick={() => copiaTesto(link)}>Copia link</button>
          </div>
        )}
      </div>

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Cauzioni</h2>
        <p className="text-muted">Blocco sulla carta a garanzia: i soldi non vengono incassati. Al rientro si rilascia il blocco oppure si addebita (anche parzialmente) in caso di danni.</p>
        {cauzioni.length === 0 && <p className="text-muted">Nessuna cauzione impostata.</p>}
        {cauzioni.length > 0 && (
          <table className="w-full">
            <thead className="text-muted"><tr className="text-left">
              <th className="p-2">Data uscita</th><th className="p-2">Cliente</th><th className="p-2">Barca</th>
              <th className="p-2">Cauzione</th><th className="p-2">Stato</th><th className="p-2">Azioni</th>
            </tr></thead>
            <tbody>
              {cauzioni.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-2">{new Date(c.startAt).toLocaleDateString("it-IT")}</td>
                  <td className="p-2">{c.clienteNome ?? "—"}</td>
                  <td className="p-2">{c.boat?.nome ?? "—"}</td>
                  <td className="p-2 font-semibold">{euro(c.cauzioneCent)}</td>
                  <td className="p-2">
                    <span className={c.cauzioneStato === "autorizzata" ? "badge-ready" : c.cauzioneStato === "in_attesa" ? "badge-pending" : "badge-block"}>{String(c.cauzioneStato).replace("_", " ")}</span>
                    {c.danniCent ? <span className="ml-1 text-xs text-coral">danni {euro(c.danniCent)}</span> : null}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2 font-bold">
                      {c.cauzioneStato !== "autorizzata" && <button className="text-ocean" onClick={() => avviaCauzione(c)}>Genera link</button>}
                      {c.cauzioneStato === "autorizzata" && <button className="text-[#177469]" onClick={() => cauzioneAzione(c, "rilascia")}>Rilascia</button>}
                      {c.cauzioneStato === "autorizzata" && <button className="text-coral" onClick={() => cauzioneAzione(c, "addebita")}>Addebita</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Registra incasso in banchina</h2>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={registraIncasso}>
          <select className="rounded-md border border-line p-2" value={manuale.bookingId} onChange={(e) => setManuale({ ...manuale, bookingId: e.target.value })}>
            <option value="">Prenotazione (facoltativa)</option>
            {pren.map((b) => <option key={b.id} value={b.id}>{new Date(b.startAt).toLocaleDateString("it-IT")} · {b.clienteNome ?? "cliente"}</option>)}
          </select>
          <input className="rounded-md border border-line p-2" placeholder="Importo €" value={manuale.importoEuro} onChange={(e) => setManuale({ ...manuale, importoEuro: e.target.value })} required />
          <select className="rounded-md border border-line p-2" value={manuale.metodo} onChange={(e) => setManuale({ ...manuale, metodo: e.target.value })}>
            <option value="contanti">Contanti</option><option value="pos">POS</option><option value="bonifico">Bonifico</option><option value="altro">Altro</option>
          </select>
          <select className="rounded-md border border-line p-2" value={manuale.tipo} onChange={(e) => setManuale({ ...manuale, tipo: e.target.value })}>
            <option value="totale">Totale</option><option value="acconto">Acconto</option><option value="saldo">Saldo</option>
          </select>
          <button className="btn-primary" type="submit">Registra</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-line p-3 text-sm font-bold">Ultimi incassi</div>
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="text-left">
              <th className="p-2">Data</th><th className="p-2">Cliente</th><th className="p-2">Prenotazione</th>
              <th className="p-2">Fornitore</th><th className="p-2">Metodo</th><th className="p-2">Noleggio</th>
              <th className="p-2">Fee NaBoat</th><th className="p-2">Pagato</th><th className="p-2">Stato</th><th className="p-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-2">{new Date(p.createdAt).toLocaleDateString("it-IT")}</td>
                <td className="p-2">{p.booking?.clienteNome ?? "—"}</td>
                <td className="p-2">{p.booking ? new Date(p.booking.startAt).toLocaleDateString("it-IT") : "—"}</td>
                <td className="p-2">{p.provider}</td>
                <td className="p-2">{p.metodo ?? "—"}</td>
                <td className="p-2">{euro(p.importoCent)}</td>
                <td className="p-2">{euro(p.feeNaboatCent)}</td>
                <td className="p-2">{euro(p.totaleCent)}</td>
                <td className="p-2">
                  <span className={badge(p.stato)}>{p.stato}</span>
                  {p.rimborsoCent > 0 && <span className="ml-1 text-xs text-muted">rimb. {euro(p.rimborsoCent)}</span>}
                </td>
                <td className="p-2">
                  {(p.stato === "pagato" || p.stato === "rimborsato_parziale") && (
                    <div className="flex gap-2 font-bold">
                      <button className="text-ocean" onClick={() => rimborsa(p, false)}>Rimborso</button>
                      <button className="text-coral" onClick={() => rimborsa(p, true)}>Totale</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td className="p-3 text-muted" colSpan={10}>Nessun incasso registrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
