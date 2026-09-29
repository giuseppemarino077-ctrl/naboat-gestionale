"use client";
import { Icona, type NomeIcona } from "./Icona";

export type TonoAvviso = "errore" | "ok" | "attenzione" | "info";

const STILE: Record<TonoAvviso, { classe: string; icona: NomeIcona }> = {
  errore: { classe: "border-danger-line bg-danger-soft text-danger", icona: "errore" },
  ok: { classe: "border-ok-line bg-ok-soft text-ok", icona: "check" },
  attenzione: { classe: "border-warn-line bg-warn-soft text-warn", icona: "avviso" },
  info: { classe: "border-info-line bg-info-soft text-info", icona: "info" },
};

export function Avviso({
  tono = "info",
  children,
  className = "",
  azione,
}: {
  tono?: TonoAvviso;
  children: React.ReactNode;
  className?: string;
  azione?: React.ReactNode;
}) {
  const stile = STILE[tono];
  return (
    <div
      role={tono === "errore" ? "alert" : "status"}
      className={"flex items-start gap-2.5 rounded-2xl border p-3 text-sm font-medium " + stile.classe + " " + className}
    >
      <Icona nome={stile.icona} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {azione}
    </div>
  );
}
