"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function Inner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("err"); setMsg("Link non valido."); return; }
    fetch("/api/v1/cliente/verifica-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok) { setState("ok"); setMsg("Email confermata. Grazie!"); }
        else { setState("err"); setMsg(j.error ?? "Conferma non riuscita."); }
      })
      .catch(() => { setState("err"); setMsg("Conferma non riuscita."); });
  }, [token]);

  return <p className="card p-4 text-sm">{state === "idle" ? "Verifica in corso…" : msg}</p>;
}

export default function VerificaEmailClientePage() {
  return (
    <div className="mx-auto grid max-w-md gap-3 px-5 py-16">
      <h1 className="font-display text-2xl font-extrabold text-deep">Conferma email</h1>
      <Suspense fallback={<p className="card p-4 text-sm">Verifica in corso…</p>}>
        <Inner />
      </Suspense>
      <a className="text-sm font-bold text-ocean" href="/area">Vai all'area personale →</a>
    </div>
  );
}
