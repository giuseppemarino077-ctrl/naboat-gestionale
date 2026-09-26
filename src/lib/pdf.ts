// Generatore PDF minimale (nessuna dipendenza esterna): pagine di solo testo con font Helvetica.
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

export type PdfRiga = { testo: string; grassetto?: boolean; spazioPrima?: number };

export function generaPdf(titolo: string, righe: PdfRiga[]): Uint8Array {
  const W = 595, H = 842, M = 56, LH = 16;
  const perPagina = Math.floor((H - M * 2 - 40) / LH);
  const pagine: PdfRiga[][] = [];
  for (let i = 0; i < righe.length; i += perPagina) pagine.push(righe.slice(i, i + perPagina));
  if (pagine.length === 0) pagine.push([]);

  const objs: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    3: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  };
  let next = 5;
  const pageRefs: number[] = [];
  for (const lin of pagine) {
    const pageNum = next++;
    const contentNum = next++;
    pageRefs.push(pageNum);
    let y = H - M;
    let content = "BT\n";
    content += `/F2 17 Tf\n1 0 0 1 ${M} ${y} Tm\n(${esc(titolo)}) Tj\n`;
    y -= 30;
    for (const r of lin) {
      y -= r.spazioPrima ?? 0;
      content += `${r.grassetto ? "/F2 12 Tf" : "/F1 11 Tf"}\n1 0 0 1 ${M} ${y} Tm\n(${esc(r.testo)}) Tj\n`;
      y -= LH;
    }
    content += "ET";
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
