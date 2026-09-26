"use client";
import { useEffect, useState } from "react";

export default function SicurezzaPage() {
  const [me, setMe] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => setMe(j.user)).catch(() => {});
    fetch("/api/v1/auth/2fa").then((r) => r.json()).then((j) => setEnabled(!!j.enabled)).catch(() => {});
  };
  useEffect(load, []);

  const call = async (body: any) => {
    setErr(""); setMsg("");
    const r = await fetch("/api/v1/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    return j;
  };

  const doSetup = async () => { const j = await call({ azione: "setup" }); if (j) setSetup({ secret: j.secret, uri: j.uri }); };
  const doEnable = async () => { const j = await call({ azione: "enable", code }); if (j) { setMsg("2FA attivata."); setSetup(null); setCode(""); load(); } };
  const doDisable = async () => { const j = await call({ azione: "disable", code }); if (j) { setMsg("2FA disattivata."); setCode(""); load(); } };

  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <div><p className="text-sm text-muted">Sicurezza</p><h1 className="text-2xl">Autenticazione a due fattori</h1></div>
      {!me && <p className="card p-3 text-sm">Effettua l'accesso per gestire la 2FA. <a className="font-bold text-ocean" href="/login">Accedi →</a></p>}
      {me && (
        <div className="card grid gap-3 p-5 text-sm">
          <p>Account: <b>{me.email}</b> ({me.role})</p>
          <p>Stato 2FA: <b className={enabled ? "text-[#177469]" : "text-coral"}>{enabled ? "attiva" : "non attiva"}</b>
            {me.twoFactorRequired && !enabled && <span className="ml-2 text-coral">— obbligatoria per il tuo ruolo</span>}</p>
          {!enabled && !setup && <button className="btn-primary w-fit" onClick={doSetup}>Attiva 2FA</button>}
          {setup && (
            <div className="grid gap-2">
              <p className="text-muted">1) Inquadra il QR o inserisci la chiave nella app (Google Authenticator, Authy…)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="QR 2FA" className="h-40 w-40 rounded bg-white p-2" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.uri)}`} />
              <code className="break-all rounded bg-[#3a2418] p-2 text-[#f6e3d5]">{setup.secret}</code>
              <p className="text-muted">2) Inserisci il codice a 6 cifre generato dall'app:</p>
              <input className="rounded-md border border-line p-2" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
              <button className="btn-primary w-fit" onClick={doEnable}>Conferma e attiva</button>
            </div>
          )}
          {enabled && (
            <div className="grid gap-2">
              <p className="text-muted">Per disattivare inserisci un codice valido:</p>
              <input className="rounded-md border border-line p-2" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
              <button className="btn-primary w-fit" onClick={doDisable}>Disattiva 2FA</button>
            </div>
          )}
          {msg && <p className="font-semibold text-[#177469]">{msg}</p>}
          {err && <p className="font-semibold text-coral">{err}</p>}
        </div>
      )}
    </div>
  );
}
