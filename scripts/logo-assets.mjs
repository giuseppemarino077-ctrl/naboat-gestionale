// Genera le immagini del logo NaBoat a partire dal file originale in design/logo-naboat.png.
//   node scripts/logo-assets.mjs
// Produce: versioni bianca e blu del logo, icone del telefono (192/512), apple-touch-icon e favicon.ico.
import sharp from "sharp";
import fs from "fs";

const SRC = "design/logo-naboat.png";
const PUB = "public";
const DEEP = "#052f3f";

// 1) versione bianca (per fondi scuri) e versione nel blu NaBoat (per fondi chiari)
const base = await sharp(SRC).resize({ width: 300 }).ensureAlpha().png().toBuffer();
await sharp(base).png().toFile(`${PUB}/img/logo-naboat-bianco.png`);

const { width, height } = await sharp(base).metadata();
const tinta = await sharp({ create: { width, height, channels: 4, background: DEEP } }).png().toBuffer();
await sharp(base)
  .composite([{ input: tinta, blend: "in" }])
  .png()
  .toFile(`${PUB}/img/logo-naboat-scuro.png`);

// 2) icona «badge»: quadrato blu NaBoat con il logo bianco centrato
const LATO = 512;
const dentro = await sharp(`${PUB}/img/logo-naboat-bianco.png`)
  .resize({ width: Math.round(LATO * 0.66), fit: "inside" })
  .toBuffer();

const badge = await sharp({ create: { width: LATO, height: LATO, channels: 4, background: DEEP } })
  .composite([{ input: dentro, gravity: "center" }])
  .png()
  .toBuffer();

await sharp(badge).png().toFile(`${PUB}/icon-512.png`);
await sharp(badge).resize(192, 192).png().toFile(`${PUB}/icon-192.png`);
await sharp(badge).resize(180, 180).png().toFile(`${PUB}/apple-touch-icon.png`);

// 3) favicon.ico con più misure dentro (16, 32, 48): formato ICO con PNG incapsulati
function ico(pngs) {
  const testata = Buffer.alloc(6);
  testata.writeUInt16LE(0, 0);
  testata.writeUInt16LE(1, 2);
  testata.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const voci = [];
  for (const p of pngs) {
    const v = Buffer.alloc(16);
    v.writeUInt8(p.lato >= 256 ? 0 : p.lato, 0);
    v.writeUInt8(p.lato >= 256 ? 0 : p.lato, 1);
    v.writeUInt8(0, 2);
    v.writeUInt8(0, 3);
    v.writeUInt16LE(1, 4);
    v.writeUInt16LE(32, 6);
    v.writeUInt32LE(p.dati.length, 8);
    v.writeUInt32LE(offset, 12);
    voci.push(v);
    offset += p.dati.length;
  }
  return Buffer.concat([testata, ...voci, ...pngs.map((p) => p.dati)]);
}

const pngs = [];
for (const lato of [16, 32, 48]) {
  pngs.push({ lato, dati: await sharp(badge).resize(lato, lato).png().toBuffer() });
}
fs.writeFileSync("src/app/favicon.ico", ico(pngs));

const elenco = [
  `${PUB}/img/logo-naboat-bianco.png`,
  `${PUB}/img/logo-naboat-scuro.png`,
  `${PUB}/icon-512.png`,
  `${PUB}/icon-192.png`,
  `${PUB}/apple-touch-icon.png`,
  "src/app/favicon.ico",
];
for (const f of elenco) {
  const m = await sharp(f).metadata().catch(() => null);
  console.log(`${f}: ${m ? `${m.width}x${m.height} ${m.format}` : "ico (16/32/48)"} ${Math.round(fs.statSync(f).size / 1024)} KB`);
}
