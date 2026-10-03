// Generatore PDF minimale (nessuna dipendenza esterna): pagine di testo con font Helvetica.
// Supporta a-capo automatico, allineamento, separatori e piè di pagina con numerazione.
// Serve per il riepilogo del conto e la copia del contratto, da scaricare e condividere.

const WINANSI: Record<string, number> = {
  "€": 0x80, "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94,
  "à": 0xe0, "è": 0xe8, "é": 0xe9, "ì": 0xec, "ò": 0xf2, "ù": 0xf9,
  "À": 0xc0, "È": 0xc8, "É": 0xc9, "Ì": 0xcc, "Ò": 0xd2, "Ù": 0xd9,
  "°": 0xb0, "£": 0xa3, "ç": 0xe7, "Ç": 0x87, "§": 0xa7,
};

function winansi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    if (WINANSI[ch] !== undefined) out.push(WINANSI[ch]);
    else if (code < 256) out.push(code);
    else out.push(0x3f);
  }
  return out;
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type PdfRiga = {
  testo: string;
  grassetto?: boolean;
  spazioPrima?: number;
  dimensione?: number;
  centro?: boolean;
  separatore?: boolean;
};

export function generaPdf(titolo: string, righe: PdfRiga[]): Uint8Array {
  const W = 595, H = 842, M = 64;
  const LARG = W - M * 2;
  const TITOLO_SIZE = 17;

  const fattore = (b: boolean) => (b ? 0.55 : 0.5);
  const larghezza = (t: string, s: number, b: boolean) => t.length * s * fattore(b);

  // A-capo automatico sulle parole; le parole più lunghe del rigo vengono spezzate.
  function avvolgi(testo: string, size: number, bold: boolean): string[] {
    const parole = testo.split(/\s+/).filter(Boolean);
    if (!parole.length) return [""];
    const out: string[] = [];
    let cur = "";
    const perRiga = Math.max(1, Math.floor(LARG / (size * fattore(bold))));
    for (const p of parole) {
      if (cur && larghezza(`${cur} ${p}`, size, bold) > LARG) { out.push(cur); cur = ""; }
      if (larghezza(p, size, bold) > LARG) {
        let resto = p;
        while (larghezza(resto, size, bold) > LARG) { out.push(resto.slice(0, perRiga)); resto = resto.slice(perRiga); }
        cur = resto;
      } else {
        cur = cur ? `${cur} ${p}` : p;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  type Elemento =
    | { tipo: "testo"; linee: string[]; size: number; bold: boolean; centro: boolean; h: number; gap: number }
    | { tipo: "linea"; h: number; gap: number };

  const elementi: Elemento[] = righe.map((r) => {
    const gap = r.spazioPrima ?? 0;
    if (r.separatore) return { tipo: "linea", h: 10, gap };
    const size = r.dimensione ?? 10.5;
    const linee = avvolgi(r.testo, size, !!r.grassetto);
    return { tipo: "testo", linee, size, bold: !!r.grassetto, centro: !!r.centro, h: linee.length * size * 1.42, gap };
  });

  const TITOLO_BLOCCO = 34;
  const FOOTER = 34;
  const areaPrima = H - M - FOOTER - TITOLO_BLOCCO;
  const areaAltra = H - M - FOOTER;

  const pagine: Elemento[][] = [];
  let corrente: Elemento[] = [];
  let usato = 0;
  let budget = areaPrima;
  for (const el of elementi) {
    const tot = el.gap + el.h;
    if (corrente.length && usato + tot > budget) {
      pagine.push(corrente);
      corrente = [];
      usato = 0;
      budget = areaAltra;
    }
    corrente.push(el);
    usato += tot;
  }
  pagine.push(corrente);

  const contenuti: string[] = pagine.map((page, pi) => {
    let c = "";
    let y = H - M;

    if (pi === 0) {
      const x = Math.max(M, (W - larghezza(titolo, TITOLO_SIZE, true)) / 2);
      c += `BT /F2 ${TITOLO_SIZE} Tf 1 0 0 1 ${x.toFixed(1)} ${y} Tm (${esc(titolo)}) Tj ET\n`;
      y -= 26;
      c += `1 w ${M} ${y} m ${W - M} ${y} l S\n`;
      y -= 18;
    }

    for (const el of page) {
      y -= el.gap;
      if (el.tipo === "linea") {
        c += `0.6 w ${M} ${y} m ${W - M} ${y} l S\n`;
        y -= el.h;
        continue;
      }
      for (const linea of el.linee) {
        const x = el.centro ? Math.max(M, (W - larghezza(linea, el.size, el.bold)) / 2) : M;
        c += `BT /${el.bold ? "F2" : "F1"} ${el.size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${esc(linea)}) Tj ET\n`;
        y -= el.size * 1.42;
      }
    }

    const fy = M - 14;
    c += `0.5 w ${M} ${fy + 14} m ${W - M} ${fy + 14} l S\n`;
    c += `BT /F1 8 Tf 1 0 0 1 ${M} ${fy} Tm (${esc(titolo)}) Tj ET\n`;
    const pag = `Pagina ${pi + 1} di ${pagine.length}`;
    c += `BT /F1 8 Tf 1 0 0 1 ${(W - M - larghezza(pag, 8, false)).toFixed(1)} ${fy} Tm (${esc(pag)}) Tj ET\n`;
    return c;
  });

  const objs: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    3: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  };
  let next = 5;
  const pageRefs: number[] = [];
  for (const content of contenuti) {
    const pageNum = next++;
    const contentNum = next++;
    pageRefs.push(pageNum);
    objs[contentNum] = `<< /Length ${winansi(content).length} >>\nstream\n${content}\nendstream`;
    objs[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
  }
  objs[2] = `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  const maxObj = next - 1;
  const parts: number[] = [];
  const offsets: number[] = new Array(maxObj + 1).fill(0);
  let offset = 0;
  const push = (s: string) => { const b = winansi(s); for (const x of b) parts.push(x); offset += b.length; };

  push("%PDF-1.4\n");
  for (let n = 1; n <= maxObj; n++) {
    offsets[n] = offset;
    push(`${n} 0 obj\n${objs[n]}\nendobj\n`);
  }
  const xrefStart = offset;
  push(`xref\n0 ${maxObj + 1}\n`);
  push("0000000000 65535 f \n");
  for (let n = 1; n <= maxObj; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return Uint8Array.from(parts);
}
