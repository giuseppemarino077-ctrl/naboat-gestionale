import { riepilogoConto } from "@/modules/ormeggio/conto";
import { aggiungiGiorni, giornoDi, inizioGiorno } from "@/modules/piattaforma/date";

type Intervallo = { dal: Date; al: Date | null };
export type PostoStatistica = { id: string; areaId: string; codice: string; createdAt: Date; area: { id: string; nome: string } };
export type PermanenzaStatistica = {
  id: string; stato: string; tipo: string; inizioAt: Date; fineAt: Date | null; finePrevistaAt: Date | null; corrispettivoCent: number | null;
  boat: { nome: string; proprietario: { nome: string } | null };
  assegnazioni: (Intervallo & { postoId: string; posto: { areaId: string } })[];
  addebiti: { importoCent: number; origine: string }[];
  payments: { rimborsoCent?: number; id: string; stato: string; tipo: string; totaleCent: number; paidAt: Date | null; condizioniSnapshot?: unknown; refunds: { importoCent: number; stato: string; completatoAt: Date | null }[] }[];
};
export type DatiStatistiche = { posti: PostoStatistica[]; permanenze: PermanenzaStatistica[]; indisponibilita: (Intervallo & { postoId: string })[] };
export type PeriodoStatistiche = { dal: string; al: string };
export type FiltroStatistiche = PeriodoStatistiche & { areaId?: string; tipo?: string };
export type CategoriaSaldo = "saldati" | "parziali" | "da_saldare";
export type TipoDettaglioStatistica = "incassi" | "residui" | "occupazione" | "contratti";
export type RigaDettaglioStatistica = {
  id: string; permanenzaId?: string; titolo: string; sottotitolo: string; data?: Date;
  inizioAt?: Date; fineAt?: Date | null; importoCent?: number; addebitatoCent?: number;
  pagatoCent?: number; residuoCent?: number; creditoCent?: number;
  disponibili?: number; riservati?: number; occupazione?: number | null;
};

export function giorniPeriodo(dal: string, al: string) {
  const out: string[] = [];
  for (let g = dal; g <= al; g = aggiungiGiorni(g, 1)) out.push(g);
  return out;
}
function range(periodo: PeriodoStatistiche): [number, number] {
  return [+inizioGiorno(periodo.dal), +inizioGiorno(aggiungiGiorni(periodo.al, 1))];
}
function unione(intervalli: [number, number][]): [number, number][] {
  const sorted = intervalli.filter(([a, b]) => a < b).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
function durata(intervalli: Intervallo[], start: number, end: number) {
  return unione(intervalli.map((i) => [Math.max(start, +i.dal), Math.min(end, i.al ? +i.al : end)])).reduce((s, [a, b]) => s + b - a, 0);
}
function durataDisponibile(occupazioni: Intervallo[], blocchi: Intervallo[], start: number, end: number) {
  const occupati = unione(occupazioni.map((a) => [Math.max(start, +a.dal), Math.min(end, a.al ? +a.al : end)]));
  return occupati.reduce((s, [a, b]) => s + b - a - durata(blocchi, a, b), 0);
}
export function giorniEquivalenti(start: Date, end: Date) {
  if (end <= start) return 0;
  const primo = giornoDi(start), ultimo = giornoDi(end);
  const a = +inizioGiorno(primo), b = +inizioGiorno(aggiungiGiorni(primo, 1));
  if (primo === ultimo) return (+end - +start) / (b - a);
  const c = +inizioGiorno(ultimo), d = +inizioGiorno(aggiungiGiorni(ultimo, 1));
  const interi = Math.max(0, Math.round((+new Date(ultimo) - +new Date(primo)) / 86400000) - 1);
  return (b - +start) / (b - a) + interi + (+end - c) / (d - c);
}
function fineServizio(p: PermanenzaStatistica) {
  return p.fineAt ?? p.finePrevistaAt;
}
function valoreContratto(p: PermanenzaStatistica) {
  const custodia = p.addebiti.filter((a) => a.origine === "custodia");
  if (custodia.length > 1) return null;
  return custodia[0]?.importoCent ?? p.corrispettivoCent;
}
function cauzione(p: PermanenzaStatistica["payments"][number]) {
  const snap = p.condizioniSnapshot;
  return p.tipo === "cauzione" || !!snap && typeof snap === "object" && "tipo" in snap && snap.tipo === "cauzione";
}
function overlap(p: PermanenzaStatistica, start: number, end: number) {
  const fine = fineServizio(p);
  return p.stato !== "annullata" && +p.inizioAt < end && (!fine || +fine > start);
}
export function calcolaStatistiche(dati: DatiStatistiche, filtro: FiltroStatistiche, adesso = new Date()) {
  const [start, end] = range(filtro);
  const days = giorniPeriodo(filtro.dal, filtro.al);
  const posti = dati.posti.filter((p) => !filtro.areaId || p.areaId === filtro.areaId);
  const ids = new Set(posti.map((p) => p.id));
  const permanenze = dati.permanenze.filter((p) => !filtro.tipo || p.tipo === filtro.tipo);
  const coorte = permanenze.filter((p) => overlap(p, start, end) && (!filtro.areaId || p.assegnazioni.some((a) => a.posto.areaId === filtro.areaId && +a.dal < end && (!a.al || +a.al > start))));
  const iniziati = permanenze.filter((p) => p.stato !== "annullata" && +p.inizioAt >= start && +p.inizioAt < end && (!filtro.areaId || p.assegnazioni.some((a) => a.posto.areaId === filtro.areaId && +a.dal <= +p.inizioAt && (!a.al || +a.al > +p.inizioAt))));
  const perPosto = new Map<string, Intervallo[]>();
  const blocchi = new Map<string, Intervallo[]>();
  for (const p of permanenze) if (p.stato !== "annullata") for (const a of p.assegnazioni) {
    if (!ids.has(a.postoId)) continue;
    const al = p.fineAt && (!a.al || p.fineAt < a.al) ? p.fineAt : a.al;
    const arr = perPosto.get(a.postoId) ?? []; arr.push({ dal: a.dal, al }); perPosto.set(a.postoId, arr);
  }
  for (const b of dati.indisponibilita) { const arr = blocchi.get(b.postoId) ?? []; arr.push(b); blocchi.set(b.postoId, arr); }
  const serie = days.map((giorno) => ({ giorno, ricevutiCent: 0, rimborsatiCent: 0, nettiCent: 0, valoreCent: 0, programmatoCent: 0, disponibili: 0, riservati: 0, occupazione: null as number | null }));
  const perGiorno = new Map(serie.map((s) => [s.giorno, s]));
  const confiniGiorni = new Map(days.map((g) => [g, [+inizioGiorno(g), +inizioGiorno(aggiungiGiorni(g, 1))] as const]));
  const composizione: Record<TipoDettaglioStatistica, RigaDettaglioStatistica[]> = { incassi: [], residui: [], occupazione: [], contratti: [] };
  const aree = new Map<string, { id: string; nome: string; disponibili: number; riservati: number; valoreCent: number; nettiCent: number; occupazione: number | null; resaCent: number | null }>();
  for (const posto of posti) {
    const area = aree.get(posto.areaId) ?? { id: posto.areaId, nome: posto.area.nome, disponibili: 0, riservati: 0, valoreCent: 0, nettiCent: 0, occupazione: null, resaCent: null };
    let disponibiliPosto = 0, riservatiPosto = 0;
    for (const s of serie) {
      const [a, b] = confiniGiorni.get(s.giorno)!;
      const begin = Math.max(a, +posto.createdAt);
      if (begin >= b) continue;
      const disponibili = (b - begin - durata(blocchi.get(posto.id) ?? [], begin, b)) / (b - a);
      const riservati = durataDisponibile(perPosto.get(posto.id) ?? [], blocchi.get(posto.id) ?? [], begin, b) / (b - a);
      s.disponibili += disponibili; s.riservati += riservati;
      area.disponibili += disponibili; area.riservati += riservati;
      disponibiliPosto += disponibili; riservatiPosto += riservati;
    }
    composizione.occupazione.push({ id: posto.id, titolo: posto.codice, sottotitolo: posto.area.nome, disponibili: disponibiliPosto, riservati: riservatiPosto, occupazione: disponibiliPosto > 0 ? riservatiPosto / disponibiliPosto * 100 : null });
    aree.set(posto.areaId, area);
  }
  let ricevutiCent = 0, rimborsatiCent = 0, pagamentiSenzaData = 0, esclusiCauzione = 0, cauzioniRicevuteCent = 0, cauzioniRimborsateCent = 0;
  for (const p of permanenze) for (const pay of p.payments) {
    const financialArea = (at: Date) => !filtro.areaId || p.assegnazioni.some((a) => a.posto.areaId === filtro.areaId && +a.dal <= +at && (!a.al || +a.al > +at));
    const registraMovimento = (id: string, at: Date, importoCent: number, rimborso: boolean) => {
      const areaId = p.assegnazioni.find((a) => +a.dal <= +at && (!a.al || +a.al > +at))?.posto.areaId;
      if (areaId && aree.has(areaId)) aree.get(areaId)!.nettiCent += importoCent;
      composizione.incassi.push({ id, permanenzaId: p.id, titolo: p.boat.nome, sottotitolo: `${p.boat.proprietario?.nome ?? "—"} · ${rimborso ? "Rimborso" : "Pagamento"}`, data: at, importoCent });
    };
    if (cauzione(pay)) {
      esclusiCauzione++;
      if (["pagato", "rimborsato", "rimborsato_parziale"].includes(pay.stato) && pay.paidAt && +pay.paidAt >= start && +pay.paidAt < end && financialArea(pay.paidAt)) cauzioniRicevuteCent += pay.totaleCent;
      for (const r of pay.refunds) if (r.stato === "riuscito" && r.completatoAt && +r.completatoAt >= start && +r.completatoAt < end && financialArea(r.completatoAt)) cauzioniRimborsateCent += r.importoCent;
      continue;
    }
    if (["pagato", "rimborsato", "rimborsato_parziale"].includes(pay.stato)) {
      if (!pay.paidAt) pagamentiSenzaData++;
      else if (+pay.paidAt >= start && +pay.paidAt < end && financialArea(pay.paidAt)) { ricevutiCent += pay.totaleCent; const s = perGiorno.get(giornoDi(pay.paidAt)); if (s) s.ricevutiCent += pay.totaleCent; registraMovimento(pay.id, pay.paidAt, pay.totaleCent, false); }
    }
    for (const [i, r] of pay.refunds.entries()) if (r.stato === "riuscito") {
      if (!r.completatoAt) pagamentiSenzaData++;
      else if (+r.completatoAt >= start && +r.completatoAt < end && financialArea(r.completatoAt)) { rimborsatiCent += r.importoCent; const s = perGiorno.get(giornoDi(r.completatoAt)); if (s) s.rimborsatiCent += r.importoCent; registraMovimento(`${pay.id}-rimborso-${i}`, r.completatoAt, -r.importoCent, true); }
    }
  }
  let valoreCent = 0, programmatoCent = 0, contrattiEsclusi = 0, contrattiStimati = 0, extraEsclusiCent = 0, nonAttribuitoCent = 0;
  for (const p of coorte) {
    const fine = fineServizio(p), base = valoreContratto(p);
    extraEsclusiCent += p.addebiti.filter((a) => a.origine !== "custodia").reduce((s, a) => s + a.importoCent, 0);
    if (!fine || base == null || fine <= p.inizioAt || base < 0) { contrattiEsclusi++; continue; }
    const totaleGiorni = giorniEquivalenti(p.inizioAt, fine);
    if (!totaleGiorni) { contrattiEsclusi++; continue; }
    contrattiStimati++;
    const parti: { giorno: string; areaId: string | null; peso: number; futuro: boolean }[] = [];
    for (const s of serie) {
      const [inizio, fineGiorno] = confiniGiorni.get(s.giorno)!;
      const a = Math.max(inizio, +p.inizioAt), b = Math.min(fineGiorno, +fine);
      if (a >= b) continue;
      const confini = [...new Set([a, b, Math.max(a, Math.min(b, +adesso)), ...p.assegnazioni.flatMap((x) => [+x.dal, x.al ? +x.al : b]).filter((x) => x > a && x < b)])].sort((x, y) => x - y);
      for (let i = 0; i < confini.length - 1; i++) {
        const l = confini[i], r = confini[i + 1];
        const ass = p.assegnazioni.find((x) => +x.dal <= l && (!x.al || +x.al >= r));
        const areaId = ass?.posto.areaId ?? null;
        if (filtro.areaId && areaId !== filtro.areaId) continue;
        parti.push({ giorno: s.giorno, areaId, peso: (r - l) / (fineGiorno - inizio) / totaleGiorni, futuro: l >= +adesso });
      }
    }
    for (const futuro of [false, true]) {
      const selected = parti.filter((p) => p.futuro === futuro);
      const total = Math.round(base * selected.reduce((s, a) => s + a.peso, 0));
      let allocated = 0, accumulated = 0;
      for (const a of selected) {
        accumulated += a.peso;
        const next = Math.round(base * accumulated), cent = next - allocated; allocated = next;
        const s = perGiorno.get(a.giorno)!;
        if (futuro) s.programmatoCent += cent;
        else { s.valoreCent += cent; if (a.areaId && aree.has(a.areaId)) aree.get(a.areaId)!.valoreCent += cent; else nonAttribuitoCent += cent; }
      }
      if (futuro) programmatoCent += total; else valoreCent += total;
    }
  }
  const dettagli = coorte.map((p) => {
    const { totaleAddebitiCent: addebitiCent, incassatoCent, residuoCent, creditoCent } = riepilogoConto(p.addebiti, p.payments);
    const categoria: CategoriaSaldo = residuoCent === 0 ? "saldati" : incassatoCent > 0 ? "parziali" : "da_saldare";
    return { id: p.id, barca: p.boat.nome, proprietario: p.boat.proprietario?.nome ?? "—", inizioAt: p.inizioAt, fineAt: fineServizio(p), valoreCent: addebitiCent, incassatoCent, residuoCent, creditoCent, categoria };
  });
  composizione.incassi.sort((a, b) => +b.data! - +a.data! || a.id.localeCompare(b.id));
  composizione.residui = dettagli.filter((d) => d.residuoCent > 0 || d.creditoCent > 0).map((d) => ({ id: d.id, permanenzaId: d.id, titolo: d.barca, sottotitolo: d.proprietario, inizioAt: d.inizioAt, fineAt: d.fineAt, addebitatoCent: d.valoreCent, pagatoCent: d.incassatoCent, residuoCent: d.residuoCent, creditoCent: d.creditoCent })).sort((a, b) => b.residuoCent - a.residuoCent || a.id.localeCompare(b.id));
  composizione.contratti = iniziati.map((p) => ({ id: p.id, permanenzaId: p.id, titolo: p.boat.nome, sottotitolo: p.boat.proprietario?.nome ?? "—", inizioAt: p.inizioAt, fineAt: fineServizio(p) })).sort((a, b) => +b.inizioAt - +a.inizioAt || a.id.localeCompare(b.id));
  const donut = { saldati: 0, parziali: 0, da_saldare: 0 };
  for (const d of dettagli) donut[d.categoria]++;
  const valoriIniziati = iniziati.map(valoreContratto).filter((v): v is number => v != null && v >= 0);
  const durateIniziate = iniziati.map((p) => { const f = fineServizio(p); return f && f > p.inizioAt ? giorniEquivalenti(p.inizioAt, f) : null; }).filter((v): v is number => v != null);
  for (const s of serie) { s.nettiCent = s.ricevutiCent - s.rimborsatiCent; s.occupazione = s.disponibili > 0 ? s.riservati / s.disponibili * 100 : null; }
  for (const a of aree.values()) { a.occupazione = a.disponibili > 0 ? a.riservati / a.disponibili * 100 : null; a.resaCent = a.disponibili > 0 ? Math.round(a.valoreCent / a.disponibili) : null; }
  const disponibili = serie.reduce((s, a) => s + a.disponibili, 0), riservati = serie.reduce((s, a) => s + a.riservati, 0);
  return {
    periodo: { dal: filtro.dal, al: filtro.al },
    metriche: { incassiCent: pagamentiSenzaData ? null : ricevutiCent - rimborsatiCent, ricevutiCent, rimborsatiCent, valoreCent: contrattiStimati || !coorte.length ? valoreCent : null, programmatoCent, residuoCent: dettagli.reduce((s, p) => s + p.residuoCent, 0), creditoCent: dettagli.reduce((s, p) => s + p.creditoCent, 0), occupazione: disponibili > 0 ? riservati / disponibili * 100 : null, disponibili, riservati, contratti: iniziati.length, valoreMedioCent: iniziati.length && valoriIniziati.length === iniziati.length ? Math.round(valoriIniziati.reduce((s, x) => s + x, 0) / iniziati.length) : null, durataMedia: iniziati.length && durateIniziate.length === iniziati.length ? durateIniziate.reduce((s, x) => s + x, 0) / iniziati.length : null },
    donut, totaleCoorte: dettagli.length, serie, aree: [...aree.values()], dettagli, composizione,
    copertura: { contrattiStimati, contrattiEsclusi, extraEsclusiCent, nonAttribuitoCent, pagamentiSenzaData, esclusiCauzione, cauzioniRicevuteCent, cauzioniRimborsateCent },
  };
}
export type StatisticaCalcolata = ReturnType<typeof calcolaStatistiche>;
