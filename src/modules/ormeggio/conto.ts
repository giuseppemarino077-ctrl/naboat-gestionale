export type IncassoConto = {
  addebitoId?: string | null;
  stato: string;
  totaleCent: number;
  rimborsoCent?: number;
  tipo?: string;
  condizioniSnapshot?: unknown;
  refunds?: { stato: string; importoCent: number }[];
};
type AddebitoConto = { id: string; importoCent: number; stato?: string; data?: Date | string; createdAt?: Date | string };

export function nettoIncasso(p: IncassoConto) {
  const snap = p.condizioniSnapshot;
  if (p.tipo === "cauzione" || snap && typeof snap === "object" && "tipo" in snap && snap.tipo === "cauzione") return 0;
  if (!["pagato", "rimborsato", "rimborsato_parziale"].includes(p.stato)) return 0;
  const rimborsato = Math.max(p.rimborsoCent ?? 0, (p.refunds ?? []).filter((r) => r.stato === "riuscito").reduce((s, r) => s + r.importoCent, 0), p.stato === "rimborsato" ? p.totaleCent : 0);
  return Math.max(0, p.totaleCent - rimborsato);
}

export function riepilogoConto(addebiti: { importoCent: number }[], payments: IncassoConto[]) {
  const totaleAddebitiCent = addebiti.reduce((s, a) => s + a.importoCent, 0);
  const incassatoCent = payments.reduce((s, p) => s + nettoIncasso(p), 0);
  return { totaleAddebitiCent, incassatoCent, residuoCent: Math.max(0, totaleAddebitiCent - incassatoCent), creditoCent: Math.max(0, incassatoCent - totaleAddebitiCent) };
}

export function calcolaConto<A extends AddebitoConto>(addebiti: A[], payments: IncassoConto[]) {
  const coperti = new Map(addebiti.map((a) => [a.id, 0]));
  const importi = new Map(addebiti.map((a) => [a.id, Math.max(0, a.importoCent)]));
  let disponibile = addebiti.reduce((s, a) => s + Math.max(0, -a.importoCent), 0);
  for (const p of payments) {
    const netto = nettoIncasso(p);
    const quota = p.addebitoId && importi.has(p.addebitoId) ? Math.min(netto, Math.max(0, importi.get(p.addebitoId)! - coperti.get(p.addebitoId)!)) : 0;
    if (p.addebitoId && quota) coperti.set(p.addebitoId, coperti.get(p.addebitoId)! + quota);
    disponibile += netto - quota;
  }
  const ordine = [...addebiti].sort((a, b) => Number(b.stato === "pagato") - Number(a.stato === "pagato") || +new Date(a.data ?? a.createdAt ?? 0) - +new Date(b.data ?? b.createdAt ?? 0) || a.id.localeCompare(b.id));
  for (const a of ordine) {
    const quota = Math.min(disponibile, Math.max(0, a.importoCent - coperti.get(a.id)!));
    coperti.set(a.id, coperti.get(a.id)! + quota);
    disponibile -= quota;
  }
  return {
    ...riepilogoConto(addebiti, payments),
    addebiti: addebiti.map((a) => {
      const incassatoCent = coperti.get(a.id)!;
      const residuoCent = Math.max(0, a.importoCent - incassatoCent);
      const incassoCollegato = payments.some((p) => p.addebitoId === a.id && ["pagato", "rimborsato", "rimborsato_parziale"].includes(p.stato));
      return { ...a, stato: residuoCent === 0 ? "pagato" : "da_pagare", incassatoCent, residuoCent, incassoDaVerificare: a.stato === "pagato" && residuoCent > 0 && !incassoCollegato };
    }),
  };
}
