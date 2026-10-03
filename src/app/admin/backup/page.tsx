"use client";
import { copiaTesto } from "@/lib/browser";
import { useEffect, useState } from "react";

type Impostazioni = {
  attivo: boolean; ogniOre: number; retentionCopie: number; includiFoto: boolean;
  destinazioneLocale: boolean; destinazioneObjectStorage: boolean; destinazioneFtp: boolean;
  soloDatabase: boolean; macchinaDelTempo: boolean; replicaAttiva: boolean; replicaHost: string | null;
  registroCompleto: boolean; avvisoEmail: string | null;
};
type Esecuzione = { id: string; iniziatoAt: string; finitoAt: string | null; esito: string; dimensioneByte: number; file: string | null; destinazioni: string; messaggio: string | null };
type Stato = {
  impostazioni: Impostazioni;
  ultima: Esecuzione | null;
  ultimoSuccesso: Esecuzione | null;
  esecuzioni: Esecuzione[];
  oreDaUltima: number | null;
  regolare: boolean;
  avvisi: string[];
  retention: { copie: number; giorni: string };
  ultimi7giorni: { riusciti: number; errori: number };
  crontab: string[];
  istruzioniTempo: string[];
};

const MB = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MB`;

export default function BackupPage() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [imp, setImp] = useState<Impostazioni | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [replica, setReplica] = useState("");

  const load = () => {
    fetch("/api/v1/admin/backup")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setStato(j); setImp(j.impostazioni); setReplica(j.impostazioni.replicaHost ?? ""); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const salva = async (patch: Partial<Impostazioni> & { replicaHost?: string | null }) => {
    const r = await fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg("Impostazioni salvate."); load();
  };

  const interruttore = (etichetta: string, campo: keyof Impostazioni, nota: string, disabilitato = false) => (
    <label className={`grid gap-1 rounded-md border border-line p-3 ${disabilitato ? "opacity-60" : ""}`}>
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={!!imp?.[campo]} disabled={disabilitato} onChange={(e) => salva({ [campo]: e.target.checked } as never)} />
        <b>{etichetta}</b>
      </span>
      <small className="text-muted">{nota}</small>
    </label>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">NaBoat Admin · Copie di sicurezza</p>
          <h1 className="text-2xl">Backup, scelti e controllati da qui.</h1>
        </div>
        <a className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" href="/admin">← Aziende</a>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {stato && imp && (
        <>
          <div className={`card p-4 text-sm ${stato.regolare ? "border-[#bfe4dc] bg-[#e1f5f1]" : "border-[#ffe0a3] bg-[#fff8e6]"}`}>
            {stato.ultima ? (
              <p>
                <b>{stato.regolare ? "Backup regolare" : "Da controllare"}</b> — ultimo: {new Date(stato.ultima.iniziatoAt).toLocaleString("it-IT")}
                {" "}({stato.oreDaUltima} ore fa), esito <b>{stato.ultima.esito}</b>
                {stato.ultima.dimensioneByte > 0 && <> · {MB(stato.ultima.dimensioneByte)}</>}
                {stato.ultima.destinazioni && <> · destinazioni: {stato.ultima.destinazioni}</>}
                {" "}· ultimi 7 giorni: <b>{stato.ultimi7giorni.riusciti}</b> riusciti, <b>{stato.ultimi7giorni.errori}</b> errori
              </p>
            ) : (
              <p><b>Nessun backup registrato.</b> Installa la riga di cron qui sotto e il primo esito comparirà qui.</p>
            )}
            <p className="mt-1 text-xs text-muted">
              Ultimo successo: {stato.ultimoSuccesso ? new Date(stato.ultimoSuccesso.iniziatoAt).toLocaleString("it-IT") : "nessuno"} ·
              {" "}copie conservate: <b>{stato.retention.copie}</b> (retention giorni sul server: {stato.retention.giorni})
            </p>
          </div>

          {stato.avvisi.length > 0 && (
            <div className="card border-[#ffe0a3] bg-[#fff8e6] p-4 text-sm">
              <b>Da sistemare</b>
              <ul className="mt-1 list-disc pl-5">
                {stato.avvisi.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Metodi attivi</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {interruttore("Backup attivi", "attivo", "Interruttore generale: se spento lo script salta l'esecuzione.")}
              {interruttore("Archivio completo sul server", "destinazioneLocale", "Database + foto + configurazione in un solo file, con retention.")}
              {interruttore("Copia su Aruba Object Storage", "destinazioneObjectStorage", "Seconda copia fuori dal server (richiede S3_* nel .env).")}
              {interruttore("Copia gratuita sull'hosting (FTP)", "destinazioneFtp", "Usa lo spazio dell'hosting del dominio (richiede FTP_* nel .env).")}
              {interruttore("Includi foto e allegati", "includiFoto", "Foto barche, loghi e foto di check-in/check-out. Se spento si salva solo il database.", imp.soloDatabase)}
              {interruttore("Solo database (leggero)", "soloDatabase", "Utile se le foto sono già su Object Storage: l'archivio diventa piccolissimo.")}
              {interruttore("Macchina del tempo (ritorno a qualsiasi secondo)", "macchinaDelTempo", "Archiviazione continua del database: richiede la configurazione qui sotto.")}
              {interruttore("Registro completo delle modifiche", "registroCompleto", "Traccia ogni modifica con i valori prima e dopo, nel registro azioni.")}
              {interruttore("Copia su un secondo server (replica)", "replicaAttiva", "Se il primo server si rompe si passa all'altro. Richiede il secondo VPS.")}
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <label className="grid gap-1">Frequenza
                <select className="rounded-md border border-line p-2" value={imp.ogniOre} onChange={(e) => salva({ ogniOre: Number(e.target.value) })}>
                  {[[1, "Ogni ora"], [2, "Ogni 2 ore"], [3, "Ogni 3 ore"], [4, "Ogni 4 ore"], [6, "Ogni 6 ore"], [12, "Ogni 12 ore"], [24, "Una volta al giorno"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">Copie conservate
                <input className="rounded-md border border-line p-2" type="number" min={2} max={2000} value={imp.retentionCopie}
                  onChange={(e) => setImp({ ...imp, retentionCopie: Number(e.target.value) })}
                  onBlur={() => salva({ retentionCopie: imp.retentionCopie })} />
              </label>
              <label className="grid gap-1">Avviso email in caso di errore
                <input className="rounded-md border border-line p-2" value={imp.avvisoEmail ?? ""} onChange={(e) => setImp({ ...imp, avvisoEmail: e.target.value })}
                  onBlur={() => salva({ avvisoEmail: imp.avvisoEmail || null })} placeholder="es. lorenzo@naboat.it" />
              </label>
              {imp.replicaAttiva && (
                <label className="grid gap-1 md:col-span-2">Indirizzo del secondo server
                  <input className="rounded-md border border-line p-2" value={replica} onChange={(e) => setReplica(e.target.value)}
                    onBlur={() => salva({ replicaHost: replica || null })} placeholder="es. 80.xx.xx.xx o replica.naboat.it" />
                </label>
              )}
            </div>
          </div>

          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Cosa fare sul server (una volta sola)</h2>
            <p className="text-muted">Installa questa riga nel crontab del VPS. Da quel momento <b>gli interruttori qui sopra comandano davvero i backup</b>: lo script chiede al portale cosa è attivo e fa solo quello. Non serve più toccare il crontab quando cambi idea.</p>
            <pre className="overflow-x-auto rounded-md bg-[#03212d] p-3 text-xs text-[#bfe4e2]">{stato.crontab.join("\n")}</pre>
            <button className="w-fit font-bold text-ocean" onClick={() => copiaTesto(stato.crontab.join("\n"))}>Copia righe di cron</button>

            {imp.macchinaDelTempo && (
              <div className="rounded-md bg-[#fff8e6] p-3">
                <b>Macchina del tempo: configurazione richiesta</b>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {stato.istruzioniTempo.map((r, i) => <li key={i}><code>{r}</code></li>)}
                </ul>
              </div>
            )}
            {imp.replicaAttiva && (
              <div className="rounded-md bg-[#fff8e6] p-3 text-xs">
                <b>Replica su secondo server</b>: con l'indirizzo <code>{imp.replicaHost}</code> si configura sul secondo VPS una copia sempre allineata del database
                e delle foto. È un intervento da fare al momento dell'attivazione, con una prova di passaggio.
              </div>
            )}
            {imp.soloDatabase && <p className="text-xs text-muted">Con «solo database» attivo, l'archivio completo non viene creato: si salvano solo i dump del database.</p>}
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-line p-3 text-sm font-bold">Ultime esecuzioni</div>
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left">
                <th className="p-2">Iniziato</th><th className="p-2">Esito</th><th className="p-2">Dimensione</th>
                <th className="p-2">File</th><th className="p-2">Destinazioni</th><th className="p-2">Nota</th>
              </tr></thead>
              <tbody>
                {stato.esecuzioni.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="p-2">{new Date(e.iniziatoAt).toLocaleString("it-IT")}</td>
                    <td className="p-2">
                      <span className={e.esito === "ok" ? "badge-ready" : e.esito === "in_corso" ? "badge-pending" : e.esito === "saltato" ? "badge-block" : "bg-[#f9e4df] text-[#914435] rounded-full px-2 py-1 text-xs font-semibold"}>{e.esito}</span>
                    </td>
                    <td className="p-2">{e.dimensioneByte ? MB(e.dimensioneByte) : "—"}</td>
                    <td className="p-2 text-xs">{e.file ?? "—"}</td>
                    <td className="p-2 text-xs">{e.destinazioni || "—"}</td>
                    <td className="p-2 text-xs text-muted">{e.messaggio ?? ""}</td>
                  </tr>
                ))}
                {!stato.esecuzioni.length && <tr><td className="p-3 text-muted" colSpan={6}>Nessuna esecuzione registrata.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!stato && !err && <p className="card p-3 text-sm text-muted">Caricamento…</p>}
    </div>
  );
}
