import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const base = process.argv[2];
if (!new URL(process.env.DATABASE_URL).pathname.startsWith("/naboat_verifica_") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Usare il collaudo isolato.");
const db = new PrismaClient();
const profile = await mkdtemp(join(tmpdir(), "naboat-chrome-"));
const browser = spawn(process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let socket;
let passed = 0;
let browserError;
let watchRendering = false;
const renderingErrors = [];
browser.on("error", (e) => { browserError = e; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    if (browserError) throw browserError;
    const value = await fn();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timeout: ${label}`);
}
let next = 0;
const pending = new Map();
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout CDP ${method}`)); }, 15000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
function check(label, ok) { assert.ok(ok, label); passed++; console.log(`PASS  browser: ${label}`); }
async function token(user) {
  return new SignJWT({ sub: user.id, role: user.role, tenantId: user.tenantId, twofa: true, ver: user.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
async function cookie(user) {
  await cdp("Network.clearBrowserCookies");
  await cdp("Network.setCookie", { name: "nb_session", value: await token(user), url: base, httpOnly: true, sameSite: "Lax" });
}
async function page(path, title) {
  await cdp("Page.navigate", { url: `${base}${path}` });
  await until(() => js(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(title)})`), title);
  await until(() => js(`!document.body.innerText.includes('Carico') && !document.body.innerText.includes('Verifico i permessi') && !document.body.innerText.includes('Aggiorno i posti')`), "dati caricati");
  await sleep(150);
}
async function click(text) {
  const found = await js(`(() => { const b = [...document.querySelectorAll('button, summary')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
  assert.ok(found, `Comando ${text}`);
}
async function digita(selector, testo) {
  await js(`(() => { const campo = document.querySelector(${JSON.stringify(selector)}); campo.scrollIntoView({block:'nearest'}); campo.focus(); })()`);
  for (const carattere of testo) {
    await cdp("Input.insertText", { text: carattere });
    await sleep(20);
    assert.ok(await js(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`), `Focus perso durante la digitazione: ${selector}`);
  }
}
async function screen(name) {
  if (!process.env.ORMEGGIO_SCREENSHOTS_DIR) return;
  await mkdir(process.env.ORMEGGIO_SCREENSHOTS_DIR, { recursive: true });
  const r = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(process.env.ORMEGGIO_SCREENSHOTS_DIR, `${name}.png`), Buffer.from(r.data, "base64"));
}
try {
  const port = await until(async () => { try { return (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { return null; } }, "Chrome");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  socket.addEventListener("message", ({ data }) => {
    const msg = JSON.parse(data);
    if (watchRendering && msg.method === "Runtime.exceptionThrown") renderingErrors.push(msg.params.exceptionDetails.text);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result); }
  });
  await cdp("Page.enable"); await cdp("Network.enable"); await cdp("Runtime.enable");
  const tenant = await db.tenant.create({ data: { nome: "Marina Browser", tipoModulo: "ormeggio", moduloOrmeggio: true, status: "active" } });
  const owner = await db.user.create({ data: { tenantId: tenant.id, email: "owner-browser@verifica.test", passwordHash: "test-isolato", role: "owner", emailVerified: true } });
  const limited = await db.user.create({ data: { tenantId: tenant.id, email: "addetto-browser@verifica.test", passwordHash: "test-isolato", role: "operatore", vedeImporti: false, emailVerified: true } });
  const auth = await token(owner);
  async function api(path, body) {
    const r = await fetch(`${base}/api/v1${path}`, { method: body ? "POST" : "GET", headers: { Cookie: `nb_session=${auth}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json(); assert.ok(r.ok, `${path}: ${j.error ?? r.status}`); return j;
  }
  const area = await api("/ormeggio/aree", { nome: "Pontile principale", righe: 8, colonne: 8 });
  const areas = await api("/ormeggio/aree");
  const posto = areas.find((a) => a.id === area.id).posti[0];
  const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const stay = await api("/ormeggio/permanenze", { postoId: posto.id, inizioAt: ieri, tipo: "ormeggio_custodia", corrispettivoCent: 30000, nuovoProprietario: { nome: "Mario Marina", telefono: "3331234567" }, nuovaBarca: { nome: "Aurora Browser", tipoCodice: "gommone", modelloTesto: "Modello Test" } });
  await api("/ormeggio/servizi", { nome: "Lavaggio browser", prezzoCent: 1000, unita: "intervento" });
  await api("/ormeggio/attivita", { permanenzaId: stay.id, tipo: "Lavaggio browser", prezzoCent: 1000, addettoId: owner.id });
  await api("/ormeggio/movimenti", { permanenzaId: stay.id, tipo: "uscita" });
  await cookie(owner);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page("/gestionale/ormeggio", "Quadro posti");
  check("nessun collegamento pubblico nel modulo", !await js(`document.body.innerText.includes('Apri sito pubblico')`));
  const bounds = await js(`(() => { const e = document.querySelector('[aria-label^="Posti dell"]'); const r = e.getBoundingClientRect(); return { top: r.top, height: r.height, width: r.width, vw: innerWidth, vh: innerHeight }; })()`);
  check("griglia centrale: inizio entro 400px e oltre metà altezza disponibile", bounds.top < 400 && bounds.height > 450 && bounds.width > 1000);
  check("un’unica voce di navigazione attiva", await js(`document.querySelectorAll('aside nav [aria-current="page"]').length === 1`));
  await screen("quadro-desktop");
  watchRendering = true;
  await page("/gestionale/ormeggio/conti", "Economia");
  await sleep(300);
  check("Economia si idrata senza errori con la cache utente già disponibile", renderingErrors.length === 0);
  watchRendering = false;
  await page("/gestionale/ormeggio", "Quadro posti");
  await js(`document.querySelector('button[aria-label^="Da sistemare:"]').click()`);
  await until(() => js(`document.querySelector('[role="dialog"]')?.innerText.includes('Aurora Browser')`), "problemi del quadro");
  check("Da sistemare mostra barca, posto e problemi reali", await js(`(() => { const t = document.querySelector('[role="dialog"]').innerText; return t.includes('Aurora Browser') && t.includes('A1') && t.includes('Pontile principale') && t.includes('attività da completare') && t.includes('Lavaggio browser · da fare') && t.includes('Contratto da generare') && t.includes('Conto da saldare'); })()`));
  check("azioni dirette verso attività, conto e documenti", await js(`(() => { const d = document.querySelector('[role="dialog"]'); return !!d.querySelector('a[href$="?tab=attivita"]') && !!d.querySelector('a[href$="?tab=conto"]') && !!d.querySelector('a[href$="?tab=scheda&documenti=1"]'); })()`));
  await screen("da-sistemare-desktop");
  await js(`document.querySelector('[role="dialog"] a[href$="?tab=scheda&documenti=1"]').click()`);
  await until(() => js(`document.querySelector('details[open]')?.innerText.includes('Contratto')`), "gestione contratto dal riepilogo");
  check("il collegamento contratto apre i comandi documentali", true);
  await page("/gestionale/ormeggio", "Quadro posti");

  await js(`document.querySelector('[aria-label="Stato del posto o della barca"]').value = 'in_mare'; document.querySelector('[aria-label="Stato del posto o della barca"]').dispatchEvent(new Event('change', {bubbles:true}));`);
  check("filtro in mare conserva la posizione assegnata", await js(`document.body.innerText.includes('1 posti corrispondono')`));
  await click("Elenco");
  check("elenco collegato alla scheda della barca", await js(`!!document.querySelector('a[href="/gestionale/ormeggio/permanenza/${stay.id}"]')`));
  await page(`/gestionale/ormeggio/permanenza/${stay.id}?tab=attivita`, "Aurora Browser");
  check("collegamento diretto alla scheda attività", await js(`!!document.querySelector('input[list="servizi"]')`));
  await click("＋ Nuova attività");
  check("assegnazione addetto disponibile al titolare", await js(`document.body.innerText.includes('Addetto')`));
  await screen("scheda-attivita-desktop");
  await click("Avvia");
  await until(() => js(`document.querySelector('table').innerText.includes('in corso')`), "avvio attività");
  check("avvio attività salvato dalla schermata", true);
  await click("Completa");
  await until(() => js(`document.querySelector('table').innerText.includes('completato')`), "completamento attività");
  const contoCompleto = await api(`/ormeggio/permanenze/${stay.id}`);
  check("completamento genera un solo addebito collegato", contoCompleto.addebiti.filter((a) => a.origine === "servizio").length === 1 && contoCompleto.conto.totaleAddebitiCent === 31000);
  await click("Storna e riapri");
  await until(() => js(`!!document.querySelector('[role="dialog"]')`), "conferma storno");
  await js(`document.querySelector('[role="dialog"] button.btn-danger').click()`);
  await until(() => js(`document.querySelector('table').innerText.includes('in corso')`), "storno attività");
  const contoStornato = await api(`/ormeggio/permanenze/${stay.id}`);
  check("storno riapre il lavoro e riallinea il conto", contoStornato.addebiti.length === 1 && contoStornato.conto.totaleAddebitiCent === 30000);

  await page("/gestionale/ormeggio/proprietari", "Proprietari");
  check("anagrafica prioritaria: modulo nuovo proprietario chiuso", !await js(`!!document.querySelector('input[placeholder="es. Mario Rossi"]')`));
  check("proprietario collegato alla permanenza", await js(`!!document.querySelector('a[href="/gestionale/ormeggio/permanenza/${stay.id}"]')`));
  await page("/gestionale/ormeggio/da-fare", "Attività");
  check("attività collegata alla sezione lavori", await js(`!!document.querySelector('a[href="/gestionale/ormeggio/permanenza/${stay.id}?tab=attivita"]')`));
  await page("/gestionale/ormeggio/movimenti", "Movimenti");
  check("movimenti collegati alla stessa barca", await js(`document.body.innerText.includes('Aurora Browser')`));
  await page("/gestionale/ormeggio/conti", "Economia");
  check("conto proprietario presente", await js(`document.body.innerText.includes('Mario Marina')`));
  await js(`document.querySelector('button[aria-expanded]').click()`);
  check("conto collegato alla sezione economica della sosta", await js(`!!document.querySelector('a[href="/gestionale/ormeggio/permanenza/${stay.id}?tab=conto"]')`));
  await page("/gestionale/ormeggio/configurazione", "Configurazione");
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Catalogo servizi (')).click()`);
  check("catalogo separato dalle aree", await js(`document.body.innerText.includes('Lavaggio browser') && !document.body.innerText.includes('Posti: 64')`));
  await cookie(limited);
  await page(`/gestionale/ormeggio/permanenza/${stay.id}?tab=attivita`, "Aurora Browser");
  check("addetto senza importi: prezzo e conto nascosti", !await js(`document.body.innerText.includes('Prezzo € / unità') || [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Conto')`));
  check("addetto: completamento economico segnalato", await js(`document.body.innerText.includes('Completamento con addebito')`));
  await click("＋ Nuova attività");
  await js(`(() => { const input = document.querySelector('input[list="servizi"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Controllo addetto browser'); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await click("＋ Aggiungi attività");
  await until(() => js(`document.body.innerText.includes('Attività aggiunta.')`), "attività addetto senza prezzo");
  const nuovaScheda = await api(`/ormeggio/permanenze/${stay.id}`);
  check("addetto crea attività senza inviare prezzi riservati", nuovaScheda.attivita.some((a) => a.tipo === "Controllo addetto browser" && a.prezzoCent === null));
  await page("/gestionale/ormeggio", "Quadro posti");
  await js(`document.querySelector('button[aria-label^="Da sistemare:"]').click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"]')`), "problemi addetto");
  check("riepilogo addetto senza conto né collegamento contratto riservato", await js(`(() => { const d = document.querySelector('[role="dialog"]'); return !d.innerText.includes('Conto da saldare') && !d.querySelector('a[href$="?tab=conto"]') && !d.querySelector('a[href$="?tab=scheda&documenti=1"]') && d.innerText.includes('Personale autorizzato'); })()`));
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page("/gestionale/ormeggio", "Quadro posti");
  const mobileGrid = await js(`document.querySelector('[aria-label^="Posti dell"]').getBoundingClientRect().top`);
  await screen("quadro-mobile");
  console.log(`Griglia mobile: inizio a ${mobileGrid}px su 844px.`);
  check("telefono: griglia visibile entro metà schermo", mobileGrid < 422);
  check("telefono: nessuno scorrimento orizzontale dell’intera pagina", await js(`document.documentElement.scrollWidth <= innerWidth`));
  await screen("quadro-mobile");
  await js(`document.querySelector('button[title*="libero —"]').click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"]')`), "assegnazione mobile");
  check("assegnazione senza importi: corrispettivo nascosto", !await js(`document.querySelector('[role="dialog"]').innerText.includes('Corrispettivo concordato')`));
  await screen("assegnazione-mobile");
  check('nuova sosta senza scelta rimessaggio', !await js(`document.querySelector('[role="dialog"]').innerText.includes('Rimessaggio') || !!document.querySelector('[role="dialog"] option[value="rimessaggio_custodia"]')`));
  await js(`document.querySelectorAll('[role="dialog"] fieldset')[0].querySelectorAll('input[type="radio"]')[1].click()`);
  await digita('input[placeholder="Nome o denominazione *"]', 'Maria Focus');
  check("nome nuovo proprietario: digitazione continua senza perdere il cursore", await js(`document.querySelector('input[placeholder="Nome o denominazione *"]').value === 'Maria Focus'`));
  await digita('input[placeholder="Telefono"]', '3339876543');
  check("telefono nuovo proprietario: digitazione continua senza perdere il cursore", await js(`document.querySelector('input[placeholder="Telefono"]').value === '3339876543'`));
  await js(`document.querySelector('input[placeholder="Telefono"]').setSelectionRange(3,3); window.dispatchEvent(new Event('focus'))`);
  await sleep(500);
  check("aggiornamenti utente preservano campo e posizione del cursore", await js(`document.activeElement === document.querySelector('input[placeholder="Telefono"]') && document.activeElement.selectionStart === 3`));
  await js(`document.querySelectorAll('[role="dialog"] fieldset')[1].querySelectorAll('input[type="radio"]')[1].click()`);
  await digita('input[placeholder="Nome barca *"]', 'Barca Focus');
  check("nome nuova barca conserva il focus", await js(`document.querySelector('input[placeholder="Nome barca *"]').value === 'Barca Focus'`));
  await digita('input[placeholder="Es. gozzo, open, gommone…"]', 'Gozzo');
  check("modulo barca semplificato: solo nome e tipologia", !await js(`document.querySelector('[role="dialog"]').innerText.toLowerCase().includes('modello')`));
  check("tipologia conserva il focus durante la digitazione", await js(`document.querySelector('input[placeholder="Es. gozzo, open, gommone…"]').value === 'Gozzo'`));
  await digita('input[placeholder="Note (facoltative)"]', 'Nota completa');
  check("note conservano il focus dopo ogni carattere", await js(`document.querySelector('input[placeholder="Note (facoltative)"]').value === 'Nota completa'`));
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  check("Tab sposta il focus al comando di registrazione", await js(`document.activeElement.textContent.includes('Registra la sosta')`));
  await click("Registra la sosta");
  await until(() => js(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Barca assegnata al posto')`), "salvataggio nuova sosta da digitazione reale");
  const creati = await api('/ormeggio/proprietari?q=Maria%20Focus');
  check("nuovo proprietario e telefono salvati con la nuova barca", creati.some((p) => p.nome === 'Maria Focus' && p.telefono === '3339876543' && p.boats.some((b) => b.nome === 'Barca Focus')));
  await js(`document.querySelector('button[title*="libero —"]').click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"]')`), "riapertura dialogo mobile");

  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await until(() => js(`!document.querySelector('[role="dialog"]')`), "chiusura con Escape");
  check("dialogo assegnazione chiudibile da tastiera", true);
  await cookie(owner);
  await page(`/gestionale/ormeggio/permanenza/${stay.id}`, "Aurora Browser");
  await click("Gestisci sosta, documenti e contatto");
  await click("WhatsApp");
  await until(() => js(`!!document.querySelector('[role="dialog"] textarea')`), "modulo messaggio");
  check("dialogo generico mantiene l’autofocus previsto sul campo", await js(`document.activeElement === document.querySelector('[role="dialog"] textarea')`));
  await digita('[role="dialog"] textarea', ' Modifica prova');
  check("dialogo generico: testo modificabile senza perdere il cursore", await js(`document.querySelector('[role="dialog"] textarea').value.includes(' Modifica prova')`));
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await until(() => js(`!document.querySelector('[role="dialog"]')`), "annullamento modulo messaggio");
  const publicRes = await fetch(`${base}/azienda/${tenant.id}`, { headers: { Cookie: `nb_session=${auth}` } });
  check("azienda solo Ormeggio esclusa dal profilo pubblico", publicRes.status === 404);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const dragArea = await api('/ormeggio/aree', { nome: 'Pontile trascinamento', righe: 4, colonne: 12 });
  const dragPosti = (await api('/ormeggio/aree')).find(a => a.id === dragArea.id).posti;
  const at = (codice) => dragPosti.find(p => p.codice === codice);
  const dragStay = await api('/ormeggio/permanenze', { postoId: at('A1').id, inizioAt: ieri, finePrevistaAt: new Date(Date.now()+30*86400000).toISOString().slice(0,10), tipo: 'ormeggio_custodia', corrispettivoCent: 12000, nuovoProprietario: { nome: 'Proprietario Trascinamento' }, nuovaBarca: { nome: 'Barca Trascinamento', tipoCodice: 'gozzo' } });
  await db.posto.updateMany({ where: { id: { in: [at('A1').id, at('A3').id] }, tenantId: tenant.id }, data: { bloccato: true } });
  await api('/ormeggio/permanenze', { postoId: at('A4').id, inizioAt: ieri, tipo: 'ormeggio_custodia', nuovoProprietario: { nome: 'Secondo Proprietario' }, nuovaBarca: { nome: 'Seconda Barca' } });
  await api('/ormeggio/permanenze', { postoId: at('A5').id, inizioAt: new Date(Date.now() + 86400000).toISOString().slice(0,10), tipo: 'ormeggio_custodia', nuovoProprietario: { nome: 'Proprietario Futuro' }, nuovaBarca: { nome: 'Barca Futura' } });
  async function apriDragArea() {
    await page('/gestionale/ormeggio', 'Quadro posti');
    await js(`(() => { const s = document.querySelector('select[aria-label="Area"]'); s.value = '${dragArea.id}'; s.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await until(() => js(`!!document.querySelector('[data-posto-id="${at('A1').id}"]')`), 'area trascinamento');
    await js('window.scrollTo(0,0)'); await sleep(200);
  }
  async function trascina(da, a, rilascia = true) {
    const centro = async (codice) => js(`(() => { const r = document.querySelector('[data-posto-id="${at(codice).id}"]').getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 }; })()`);
    const start = await centro(da), end = await centro(a);
    await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', ...start });
    await cdp('Input.dispatchMouseEvent', { type:'mousePressed', ...start, button:'left', buttons:1, clickCount:1 });
    for (let i=1;i<=10;i++) {
      await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', x:start.x+(end.x-start.x)*i/10, y:start.y+(end.y-start.y)*i/10, button:'left', buttons:1 });
      await sleep(25);
    }
    if (rilascia) await cdp('Input.dispatchMouseEvent', { type:'mouseReleased', ...end, button:'left', buttons:0, clickCount:1 });
    return end;
  }
  const posizione = () => db.permanenza.findFirst({ where: { id: dragStay.id, tenantId: tenant.id } });
  const assegnazioni = () => db.assegnazionePosto.count({ where: { tenantId: tenant.id, permanenzaId: dragStay.id } });
  await apriDragArea();
  check('griglia: tutte le celle hanno dimensioni uniformi', await js(`(() => { const cells=[...document.querySelectorAll('[data-posto-id]')].map(b=>b.getBoundingClientRect()); return cells.every(r=>Math.abs(r.height-cells[0].height)<1 && Math.abs(r.width-cells[0].width)<1); })()`));
  await js(`document.activeElement?.blur(); document.querySelector('[data-posto-id="${at('A1').id}"]').focus()`);
  await cdp('Page.bringToFront');
  const previewPoint = await js(`(() => { const r=document.querySelector('[data-posto-id="${at('A1').id}"]').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',...previewPoint});
  await until(() => js(`!!document.querySelector('[data-posto-anteprima]')`), 'anteprima anche su celle grandi');
  check('anteprima disponibile su ogni barca, con nomi completi', await js(`document.querySelector('[data-posto-anteprima]').textContent.includes('Proprietario Trascinamento') && document.querySelector('[data-posto-anteprima]').textContent.includes('Barca Trascinamento')`));
  await screen('anteprima-barca-desktop');
  await js(`document.activeElement?.blur()`);
  check('celle uniformi: nomi senza taglio verticale nel piè di cella', await js(`(() => { const n=document.querySelector('[data-posto-id="${at('A1').id}"] [data-anagrafica]'); return n.scrollHeight<=n.clientHeight+1 && [...n.children].every(c=>c.getBoundingClientRect().bottom<=n.getBoundingClientRect().bottom); })()`));
  await screen('nomi-leggibili-desktop');
  const end = await trascina('A1','A2',false);
  check('trascinamento reale: anteprima sollevata e destinazione evidenziata', await js(`!!document.querySelector('[data-drag-anteprima]') && document.querySelector('[data-posto-id="${at('A2').id}"]').className.includes('ring-ocean')`));
  await screen('trascinamento-desktop');
  await cdp('Input.dispatchMouseEvent', { type:'mouseReleased', ...end, button:'left', buttons:0, clickCount:1 });
  await until(() => js(`document.querySelector('[data-posto-id="${at('A2').id}"]')?.dataset.permanenzaId === '${dragStay.id}' && !document.querySelector('[data-drag-anteprima]')`), 'spostamento reale');
  check('spostamento anche da posto bloccato: origine libera senza duplicare la barca', await js(`!document.querySelector('[data-posto-id="${at('A1').id}"]').dataset.permanenzaId && document.querySelectorAll('[data-permanenza-id="${dragStay.id}"]').length === 1 && !document.querySelector('[role="dialog"]')`));
  check('trasferimento aggiorna assegnazioni, movimento e conto coerente', (await posizione()).postoId === at('A2').id && await assegnazioni() === 2 && await db.movimento.count({ where: { tenantId:tenant.id, permanenzaId:dragStay.id, tipo:'trasferimento' } }) === 1 && (await api(`/ormeggio/permanenze/${dragStay.id}`)).conto.totaleAddebitiCent === 12000);
  for (const codice of ['A3','A4']) {
    await trascina('A2',codice); await sleep(400);
    check(`destinazione ${codice} bloccata/occupata: assegnazione preservata`, (await posizione()).postoId === at('A2').id && await assegnazioni() === 2);
  }
  await trascina('A2','A5');
  await until(() => js(`document.body.innerText.includes('Il nuovo posto è occupato in questo periodo') && !document.querySelector('[data-drag-anteprima]')`), 'rifiuto conflitto futuro');
  check('conflitto futuro: rifiuto server senza storico o movimenti parziali', (await posizione()).postoId === at('A2').id && await assegnazioni() === 2);
  const escEnd = await trascina('A2','A6',false);
  await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape' });
  await cdp('Input.dispatchMouseEvent', { type:'mouseReleased', ...escEnd, button:'left', buttons:0, clickCount:1 });
  check('Escape annulla il trascinamento senza modificare i dati', !await js(`!!document.querySelector('[data-drag-anteprima]')`) && await assegnazioni() === 2);
  async function dimensiona(colonne, righe=4) {
    return fetch(`${base}/api/v1/ormeggio/aree/${dragArea.id}`, { method:'PATCH', headers:{ Cookie:`nb_session=${auth}`, 'Content-Type':'application/json' }, body:JSON.stringify({colonne,righe}) });
  }
  assert.equal((await dimensiona(40)).status,200);
  await apriDragArea();
  check('40 colonne: tutti i posti visibili senza scorrimento orizzontale', await js(`(() => { const g=document.querySelector('[aria-label^="Posti dell"]'); return g.querySelectorAll('[data-posto-id]').length===160 && g.scrollWidth<=g.clientWidth && document.documentElement.scrollWidth<=innerWidth; })()`));
  await cdp('Page.bringToFront');
  await js(`document.activeElement?.blur(); document.querySelector('[data-posto-id="${at('A2').id}"]').focus()`);
  await sleep(200);
  await until(() => js(`[...document.querySelectorAll('body > div')].some(e=>e.className.includes('pointer-events-none') && e.textContent.includes('Proprietario Trascinamento'))`), 'anteprima al focus');
  await screen('griglia-40-colonne');
  check('griglia densa: anteprima leggibile al focus', await js(`[...document.querySelectorAll('body > div')].some(e=>e.className.includes('pointer-events-none') && e.textContent.includes('Proprietario Trascinamento'))`));
  await cdp("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:true });
  await sleep(300);
  check('telefono con 40 colonne: nessuno scorrimento orizzontale', await js(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('[aria-label^="Posti dell"]').scrollWidth<=document.querySelector('[aria-label^="Posti dell"]').clientWidth`));
  check('anteprima resta interamente visibile dopo il ridimensionamento', await js(`(() => { const r=document.querySelector('[data-posto-anteprima]').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight; })()`));
  await screen('griglia-40-colonne-mobile');

  assert.equal((await dimensiona(12)).status,200);
  check('riduzione griglia rimuove i posti inutilizzati e riallinea il totale', (await api('/ormeggio/aree')).find(a=>a.id===dragArea.id).posti.length===48);
  assert.equal((await dimensiona(1)).status,200);
  const ridotta = await api('/ormeggio/griglia');
  check('riduzione consentita anche con assegnazioni e storico', ridotta.aree.find(a=>a.id===dragArea.id).posti.length===4 && ridotta.fuoriGriglia.some(p=>p.id===dragStay.id) && await assegnazioni()===2);
  check('riduzione conserva la sosta attiva e il conto', (await api(`/ormeggio/permanenze/${dragStay.id}`)).postoFuoriGriglia && (await api(`/ormeggio/permanenze/${dragStay.id}`)).conto.totaleAddebitiCent===12000);
  const fuoriRes = await fetch(`${base}/api/v1/ormeggio/permanenze/${dragStay.id}`, {method:'PATCH',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({azione:'sposta',postoId:at('A4').id})});
  check('un posto rimosso non accetta nuove assegnazioni', fuoriRes.status===409);
  assert.equal((await dimensiona(12)).status,200);
  check('riallargando la griglia si recuperano coordinate e assegnazioni originali', (await api('/ormeggio/griglia')).aree.find(a=>a.id===dragArea.id).posti.find(p=>p.id===at('A2').id).permanenza.id===dragStay.id && !(await api(`/ormeggio/permanenze/${dragStay.id}`)).postoFuoriGriglia);
  await cdp("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await apriDragArea();
  check('barra quadro senza pulsante Aggiorna ridondante', !await js(`!!document.querySelector('button[aria-label="Aggiorna quadro"]')`));
  await click('Elenco');
  await js(`document.querySelector('button[aria-label="Configura posti"]').click()`);
  await until(() => js(`!!document.querySelector('form[aria-label="Configura griglia selezionata"]')`), 'configurazione griglia corrente');
  check('Configura posti apre la griglia selezionata e i suoi valori', await js(`(() => { const f=document.querySelector('form[aria-label="Configura griglia selezionata"]'); const i=f.querySelectorAll('input'); return i[0].value==='Pontile trascinamento' && i[1].value==='4' && i[2].value==='12' && !!document.querySelector('[data-posto-id="${at('A2').id}"]') && ![...document.querySelectorAll('details')].some(d=>d.open); })()`));
  await js(`document.querySelector('form[aria-label="Configura griglia selezionata"] input').select()`);
  await digita('form[aria-label="Configura griglia selezionata"] input', 'Pontile configurato');
  await js(`window.dispatchEvent(new Event('focus'))`);
  await sleep(250);
  check('configurazione preserva la digitazione durante gli aggiornamenti', await js(`document.querySelector('form[aria-label="Configura griglia selezionata"] input').value==='Pontile configurato'`));
  await js(`(() => { const i=document.querySelectorAll('form[aria-label="Configura griglia selezionata"] input')[2]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'13'); i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await click('Salva griglia');
  await until(() => js(`document.body.innerText.includes('Griglia «Pontile configurato» aggiornata.') && document.querySelectorAll('[data-posto-id]').length===52`), 'dimensioni salvate sul quadro');
  const configurate = await api('/ormeggio/aree');
  check('salvataggio modifica solo l’area corrente e adatta subito la griglia', configurate.find(a=>a.id===dragArea.id).colonne===13 && configurate.find(a=>a.id===area.id).colonne===8);
  await screen('configura-griglia-corrente');
  await js(`(() => { const s=document.querySelector('select[aria-label="Area"]'); s.value='${area.id}'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await until(() => js(`document.querySelector('form[aria-label="Configura griglia selezionata"] input')?.value==='Pontile principale'`), 'configurazione altra area');
  check('cambio area aggiorna anche il modulo di configurazione', await js(`document.querySelectorAll('form[aria-label="Configura griglia selezionata"] input')[2].value==='8'`));
  const blocco = configurate.find(a=>a.id===area.id).posti.find(p=>p.codice==='D8');
  await js(`document.querySelector('[data-posto-id="${blocco.id}"]').click()`);
  await until(() => js(`document.querySelector('[data-posto-id="${blocco.id}"]').dataset.statoPosto==='bloccato' && !document.querySelector('button[aria-label="Fine configurazione"]').disabled`), 'blocco singolo posto');
  check('configurazione conserva blocco e riabilitazione dei posti', (await db.posto.findFirst({where:{id:blocco.id,tenantId:tenant.id}})).bloccato);
  await js(`document.querySelector('[data-posto-id="${blocco.id}"]').click()`);
  await until(() => js(`document.querySelector('[data-posto-id="${blocco.id}"]').dataset.statoPosto==='libero' && !document.querySelector('button[aria-label="Fine configurazione"]').disabled`), 'riabilitazione singolo posto');
  await js(`document.querySelector('button[aria-label="Fine configurazione"]').click()`);
  await sleep(250);
  await db.area.update({where:{id:area.id,tenantId:tenant.id},data:{nome:'Pontile aggiornato automaticamente'}});
  await js(`window.dispatchEvent(new Event('focus'))`);
  await until(() => js(`document.querySelector('[aria-label^="Posti dell"]')?.getAttribute('aria-label').includes('Pontile aggiornato automaticamente')`), 'aggiornamento al ritorno sulla scheda');
  check('aggiornamento automatico funziona senza pulsante manuale', true);
  await js(`(() => { const f=window.fetch; window.fetch=(...args)=>{ if(String(args[0]).startsWith('/api/v1/ormeggio/griglia')) { window.fetch=f; return Promise.reject(new Error('Interruzione simulata')); } return f(...args); }; window.dispatchEvent(new Event('focus')); })()`);
  await until(() => js(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Riprova')`), 'ripristino caricamento');
  check('errore di rete mostra Riprova solo quando necessario', await js(`document.body.innerText.includes('Connessione interrotta. Riprova a caricare il quadro.')`));
  await click('Riprova');
  await until(() => js(`![...document.querySelectorAll('button')].some(b=>b.textContent==='Riprova')`), 'caricamento ripristinato');
  check('Riprova recupera il quadro e rimuove l’errore', !await js(`document.body.innerText.includes('Connessione interrotta. Riprova a caricare il quadro.')`));
  await api(`/ormeggio/permanenze/${dragStay.id}/contratto`, {});
  const primaRimozione = await api(`/ormeggio/permanenze/${dragStay.id}`);
  const postoDaRimuovere = (await api('/ormeggio/aree')).find(a=>a.id===dragArea.id).posti.find(p=>p.codice==='A6').id;
  await apriDragArea();
  await js(`document.querySelector('button[aria-label="Configura posti"]').click()`);
  await click('Elimina area');
  await until(() => js(`!!document.querySelector('[role="dialog"] button.btn-danger')`), 'conferma eliminazione area');
  await js(`document.querySelector('[role="dialog"] button.btn-danger').click()`);
  await until(() => js(`!!document.querySelector('[aria-label="Barche fuori griglia"] a[href="/gestionale/ormeggio/permanenza/${dragStay.id}"]') && !document.querySelector('select[aria-label="Area"] option[value="${dragArea.id}"]')`), 'area rimossa con storico');
  check('eliminazione da browser consentita con barche presenti e storico', !(await api('/ormeggio/aree')).some(a=>a.id===dragArea.id));
  const dopoRimozione = await api(`/ormeggio/permanenze/${dragStay.id}`);
  check('eliminazione conserva conto, contratto, assegnazioni e movimenti', dopoRimozione.postoFuoriGriglia && dopoRimozione.stato==='attiva' && dopoRimozione.conto.totaleAddebitiCent===primaRimozione.conto.totaleAddebitiCent && dopoRimozione.contratto.id===primaRimozione.contratto.id && dopoRimozione.assegnazioni.length===primaRimozione.assegnazioni.length && dopoRimozione.movimenti.length===primaRimozione.movimenti.length);
  check('lo storico delle aree rimosse resta consultabile', (await api(`/ormeggio/griglia?data=${ieri}`)).fuoriGriglia.some(p=>p.id===dragStay.id));
  const pdfDopo = await fetch(`${base}/api/v1/ormeggio/permanenze/${dragStay.id}/riepilogo`,{headers:{Cookie:`nb_session=${auth}`}});
  check('riepilogo PDF funzionante dopo la rimozione della griglia', pdfDopo.status===200 && pdfDopo.headers.get('content-type').includes('application/pdf'));
  const tentaNuova = await fetch(`${base}/api/v1/ormeggio/permanenze`,{method:'POST',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({postoId:postoDaRimuovere,inizioAt:ieri,tipo:'ormeggio_custodia',nuovoProprietario:{nome:'Non creare'},nuovaBarca:{nome:'Non creare'}})});
  check('i posti di una griglia eliminata non accettano nuove soste', tentaNuova.status===409 && await db.boat.count({where:{tenantId:tenant.id,nome:'Non creare'}})===0);
  await screen('griglia-rimossa-barche-conservate');
  await page(`/gestionale/ormeggio/permanenza/${dragStay.id}`, 'Barca Trascinamento');
  check('scheda di una barca fuori griglia mostra il trasferimento diretto', await js(`document.body.innerText.includes('Il posto precedente è stato rimosso') && [...document.querySelectorAll('button')].some(b=>b.textContent==='Sposta barca')`));
  await click('Sposta barca');
  await until(() => js(`!!document.querySelector('[role="dialog"] select')`), 'riassegnazione fuori griglia');
  const destinazione = (await api('/ormeggio/aree')).find(a=>a.id===area.id).posti.find(p=>p.codice==='D8');
  await js(`(() => { const s=document.querySelector('[role="dialog"] select'); s.value='${destinazione.id}'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await click('Sposta');
  await until(() => js(`document.querySelector('h1')?.textContent.includes('D8') && !document.body.innerText.includes('Il posto precedente è stato rimosso')`), 'nuovo posto assegnato');
  const riassegnata = await api('/ormeggio/griglia');
  check('riassegnazione da area eliminata funziona e rimuove la segnalazione', riassegnata.aree.find(a=>a.id===area.id).posti.find(p=>p.id===destinazione.id).permanenza.id===dragStay.id && !riassegnata.fuoriGriglia.some(p=>p.id===dragStay.id) && (await api(`/ormeggio/permanenze/${dragStay.id}`)).conto.totaleAddebitiCent===12000);

  const ownerRecord = (await api('/ormeggio/proprietari?q=Mario'))[0];
  await page('/gestionale/ormeggio/proprietari', 'Proprietari');
  await js(`[...document.querySelectorAll('article button')].find(b=>b.textContent.includes('Mario Marina')).click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"] form')`), 'modifica proprietario');
  await digita('[role="dialog"] input', ' Aggiornato');
  await js(`(() => { const inputs=document.querySelectorAll('[role="dialog"] input'); for (const [i,v] of [[1,'3330011223'],[2,'mario.aggiornato@verifica.test']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],v); inputs[i].dispatchEvent(new Event('input',{bubbles:true})); } })()`);
  await click('Salva modifiche');
  await until(() => js(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Proprietario aggiornato.')`), 'salvataggio proprietario');
  const updatedOwner = (await api('/ormeggio/proprietari?q=3330011223'))[0];
  check('proprietario: nome, telefono ed email modificabili senza perdere il focus', updatedOwner.id===ownerRecord.id && updatedOwner.nome.includes('Aggiornato') && updatedOwner.email==='mario.aggiornato@verifica.test');
  check('recapiti aggiornati collegati alla stessa barca e sosta', (await api(`/ormeggio/permanenze/${stay.id}`)).boat.proprietario.telefono==='3330011223');
  await page('/gestionale/ormeggio/conti', 'Economia');
  await js(`[...document.querySelectorAll('td button')].find(b=>b.textContent.includes('Aggiornato')).click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"]')`), 'conto da nome proprietario');
  check('economia: nome apre riepilogo e accesso alla gestione completa del conto', await js(`document.querySelector('[role="dialog"]').innerText.includes('Addebitato') && !!document.querySelector('[role="dialog"] a[href="/gestionale/ormeggio/permanenza/${stay.id}?tab=conto"]')`));
  await screen('economia-conto-proprietario');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  const seeded = await api('/ormeggio/servizi/predefiniti', {});
  const catalogue = await api('/ormeggio/servizi');
  check('catalogo completo, inizializzazione idempotente e prezzi da configurare', seeded.aggiunti===0 && catalogue.length>=59 && catalogue.find(x=>x.nome==='Fornitura energia elettrica')?.prezzoCent===null);
  await page('/gestionale/ormeggio/configurazione', 'Configurazione');
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Catalogo servizi (')).click()`);
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Modifica' && b.parentElement.parentElement.textContent.includes('Fornitura energia elettrica')).click()`);
  await until(() => js(`!!document.querySelector('[role="dialog"] form')`), 'modifica catalogo');
  await js(`(() => { const inputs=document.querySelectorAll('[role="dialog"] input'); for(const [i,v] of [[0,'Energia elettrica personalizzata'],[1,'0,45'],[2,'kWh']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[i],v); inputs[i].dispatchEvent(new Event('input',{bubbles:true})); } })()`);
  await click('Salva servizio');
  await until(() => js(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Servizio aggiornato.')`), 'salvataggio servizio');
  check('catalogo: nome prezzo e unità modificabili', (await api('/ormeggio/servizi')).some(x=>x.nome==='Energia elettrica personalizzata' && x.prezzoCent===45 && x.unita==='kWh'));
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
  const futurePlace=(await api('/ormeggio/aree')).find(a=>a.id===area.id).posti.find(p=>p.codice==='G8');
  const futureStay=await api('/ormeggio/permanenze',{postoId:futurePlace.id,inizioAt:tomorrow,proprietarioId:ownerRecord.id,nuovaBarca:{nome:'Barca futura da eliminare'},corrispettivoCent:1000});
  await api('/ormeggio/incassi',{permanenzaId:stay.id,importoCent:1000,metodo:'contanti'});

  const fineOwner=await fetch(`${base}/api/v1/ormeggio/permanenze/${stay.id}`,{method:'PATCH',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({azione:'aggiorna',finePrevistaAt:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})});
  assert.equal(fineOwner.status,200);
  await api(`/ormeggio/permanenze/${stay.id}/contratto`,{});
  const beforeDelete=await api(`/ormeggio/permanenze/${stay.id}`);

  const duplicateOwner=await api('/ormeggio/proprietari',{nome:'Altro contatto',telefono:'3338877665'});
  const duplicateResponse=await fetch(`${base}/api/v1/ormeggio/proprietari/${ownerRecord.id}`,{method:'PATCH',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({nome:'Non salvare',telefono:duplicateOwner.telefono,email:null,note:null})});
  check('modifica recapiti duplicati rifiutata senza unire proprietari',duplicateResponse.status===409 && (await api('/ormeggio/proprietari?q=3330011223'))[0].id===ownerRecord.id);
  const protectedService=(await api('/ormeggio/servizi')).find(s=>s.nome==='Lavaggio browser');
  const limitedEdit=await fetch(`${base}/api/v1/ormeggio/servizi/${protectedService.id}`,{method:'PATCH',headers:{Cookie:`nb_session=${await token(limited)}`,'Content-Type':'application/json'},body:JSON.stringify({nome:'Lavaggio browser riservato'})});
  const limitedData=await limitedEdit.json();
  check('modifica nome servizio non rivela prezzi al personale senza permesso',limitedEdit.status===200 && limitedData.prezzoCent===null && (await db.servizioCatalogo.findFirst({where:{id:protectedService.id,tenantId:tenant.id}})).prezzoCent===1000);
  const limitedPrice=await fetch(`${base}/api/v1/ormeggio/servizi/${protectedService.id}`,{method:'PATCH',headers:{Cookie:`nb_session=${await token(limited)}`,'Content-Type':'application/json'},body:JSON.stringify({prezzoCent:100})});
  check('prezzi catalogo modificabili solo con permesso importi',limitedPrice.status===403);
  const otherTenant=await db.tenant.create({data:{nome:'Altra marina privacy',moduloOrmeggio:true,status:'active'}});
  const otherUser=await db.user.create({data:{tenantId:otherTenant.id,email:'privacy-ormeggio@verifica.test',passwordHash:'test',role:'owner',emailVerified:true}});
  const denied=await fetch(`${base}/api/v1/ormeggio/proprietari/${ownerRecord.id}`,{method:'DELETE',headers:{Cookie:`nb_session=${await token(otherUser)}`}});
  check('eliminazione proprietario isolata tra aziende',denied.status===404 && !(await db.proprietario.findFirst({where:{id:ownerRecord.id,tenantId:tenant.id}})).archiviato);
  await page('/gestionale/ormeggio/proprietari','Proprietari');
  await js(`[...document.querySelectorAll('article button')].find(b=>b.textContent.includes('Aggiornato')).click()`);
  await click('Elimina proprietario');
  await click('Elimina proprietario e barche');
  await until(() => js(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Posti attuali e futuri liberati.')`), 'eliminazione proprietario da interfaccia');
  check('eliminazione rimuove proprietario e tutte le barche dagli elenchi', !(await api('/ormeggio/proprietari')).some(x=>x.id===ownerRecord.id) && !(await api('/boats?uso=custodia')).some(x=>[stay.boatId,futureStay.boatId].includes(x.id)));
  const gridAfter=await api('/ormeggio/griglia');
  const gridTomorrow=await api(`/ormeggio/griglia?data=${tomorrow}`);
  check('eliminazione libera posti attuali e futuri senza barche fuori griglia', !gridAfter.aree.flatMap(a=>a.posti).some(p=>p.permanenza?.id===stay.id) && !gridTomorrow.aree.flatMap(a=>a.posti).some(p=>[stay.id,futureStay.id].includes(p.permanenza?.id)) && !gridTomorrow.fuoriGriglia.some(p=>[stay.id,futureStay.id].includes(p.id)));
  const afterDelete=await api(`/ormeggio/permanenze/${stay.id}`);
  check('eliminazione conserva contabilità e chiude le soste',afterDelete.stato==='chiusa' && afterDelete.addebiti.length===beforeDelete.addebiti.length && afterDelete.payments.length===1 && afterDelete.payments[0].id===beforeDelete.payments[0].id && afterDelete.contratto.id===beforeDelete.contratto.id && (await api(`/ormeggio/permanenze/${futureStay.id}`)).stato==='chiusa');
  check('economia conserva accessibile il conto del proprietario eliminato',(await api('/ormeggio/conti')).some(c=>c.id===ownerRecord.id && c.archiviato && c.dettaglio.some(d=>d.permanenzaId===stay.id)));
  const deletedAssign=await fetch(`${base}/api/v1/ormeggio/permanenze`,{method:'POST',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({postoId:futurePlace.id,inizioAt:tomorrow,proprietarioId:ownerRecord.id,nuovaBarca:{nome:'Non ripristinare'}})});
  check('proprietario eliminato non accetta nuove assegnazioni',deletedAssign.status===404);
  check('attività operative non mostrano più le barche eliminate',!(await api('/ormeggio/attivita?daFare=1')).some(a=>a.permanenzaId===stay.id));

  const stoppedJob=afterDelete.attivita.find(a=>a.stato==='in_corso' || a.stato==='da_fare');
  const stoppedResponse=await fetch(`${base}/api/v1/ormeggio/attivita/${stoppedJob.id}`,{method:'PATCH',headers:{Cookie:`nb_session=${auth}`,'Content-Type':'application/json'},body:JSON.stringify({stato:'completato'})});
  check('barca eliminata: nessun completamento tardivo che generi nuovi addebiti',stoppedResponse.status===409 && (await api(`/ormeggio/permanenze/${stay.id}`)).addebiti.length===afterDelete.addebiti.length);
  await page(`/gestionale/ormeggio/permanenza/${stay.id}?tab=attivita`,'Aurora Browser');
  check('scheda storica: barca rimossa segnalata e nuove attività nascoste',await js(`document.body.innerText.includes('Barca rimossa dagli elenchi operativi') && !document.body.innerText.includes('＋ Nuova attività') && ![...document.querySelectorAll('button')].some(b=>['Avvia','Completa'].includes(b.textContent.trim()))`));
  await click('Conto');
  check('scheda storica: conto ancora gestibile dopo eliminazione',await js(`document.body.innerText.includes('＋ Nuovo addebito') && document.body.innerText.includes('＋ Registra incasso esterno')`));
  await page('/gestionale/calendario', 'Quadro posti');
  check('azienda Ormeggio: pagina Noleggio reindirizzata prima del montaggio', await js(`location.pathname === '/gestionale/ormeggio'`));
  await page('/gestionale/impostazioni', 'Dati dell’azienda');
  check('impostazioni Ormeggio interne senza anteprima pubblica', !await js(`!!document.querySelector('iframe') || document.body.innerText.includes('Apri sito pubblico') || document.body.innerText.includes('Profilo pubblico')`));

  const dedicatedArea = await api('/ormeggio/aree', { nome: 'Barche dedicate browser', righe: 1, colonne: 1 });
  const dedicatedPlace = (await api('/ormeggio/aree')).find(a => a.id === dedicatedArea.id).posti[0];
  const dedicatedStay = await api('/ormeggio/permanenze', { postoId: dedicatedPlace.id, inizioAt: ieri, nuovoProprietario: { nome: 'Proprietario dedicato browser' }, nuovaBarca: { nome: 'Barca dedicata browser', tipoCodice: 'gozzo' } });
  await page(`/gestionale/ormeggio/permanenza/${dedicatedStay.id}`, 'Barca dedicata browser');
  await js(`(() => { const label = [...document.querySelectorAll('label')].find(l => l.textContent.includes('Nome barca')); label.querySelector('input').setAttribute('data-collaudo', 'nome-custodia'); })()`);
  await digita('input[data-collaudo="nome-custodia"]', ' aggiornata');
  await click('Salva dati barca');
  await until(() => js(`document.querySelector('h1')?.textContent.includes('Barca dedicata browser aggiornata')`), 'salvataggio servizio barche dedicato');
  check('modifica nome barca da scheda conserva il focus e salva nelle nuove API', (await api(`/ormeggio/barche/${dedicatedStay.boatId}`)).nome === 'Barca dedicata browser aggiornata');
  check('modifica nome barca aggiorna lo stesso posto in griglia', (await api('/ormeggio/griglia')).aree.find(a => a.id === dedicatedArea.id).posti[0].permanenza.boatNome === 'Barca dedicata browser aggiornata');

  const mixedTenant = await db.tenant.create({ data: { nome: 'Azienda mista browser', tipoModulo: 'entrambi', moduloOrmeggio: true, status: 'active' } });
  const mixedUser = await db.user.create({ data: { tenantId: mixedTenant.id, email: 'mista-browser@verifica.test', passwordHash: 'isolato', role: 'owner', emailVerified: true } });
  await cookie(mixedUser);
  await page('/gestionale/ormeggio', 'Quadro posti');
  await until(() => js(`!!document.querySelector('aside [aria-label="Modulo"]')`), 'selettore azienda mista');
  check('azienda mista: selettore mostra entrambi i prodotti', await js(`document.querySelector('aside [aria-label="Modulo"]').querySelectorAll('button').length === 2`));
  await click('Noleggio');
  await until(() => js(`location.pathname === '/gestionale/oggi' && document.querySelector('h1')?.textContent.includes('Buongiorno')`), 'passaggio al Noleggio');
  check('passaggio al Noleggio aggiorna menu e collegamenti pubblici', await js(`document.querySelector('aside [aria-label="Modulo"] [aria-pressed="true"]').textContent.includes('Noleggio') && document.querySelector('aside').innerText.includes('Apri sito pubblico')`));
  await click('Ormeggio');
  await until(() => js(`location.pathname === '/gestionale/ormeggio' && document.querySelector('h1')?.textContent.includes('Quadro posti')`), 'ritorno Ormeggio');
  await page('/gestionale/impostazioni', 'Dati dell’azienda');
  check('azienda mista: impostazioni ricordano la scelta Ormeggio', !await js(`!!document.querySelector('iframe') || document.querySelector('aside').innerText.includes('Apri sito pubblico')`));
  await click('Noleggio');
  await until(() => js(`location.pathname === '/gestionale/oggi'`), 'ritorno Noleggio dalle impostazioni');
  await page('/gestionale/impostazioni', 'Profilo pubblico');
  check('azienda mista: profilo pubblico resta disponibile nel Noleggio', await js(`!!document.querySelector('iframe[title="Anteprima profilo pubblico"]')`));

  const rentalTenant = await db.tenant.create({ data: { nome: 'Noleggio puro browser', tipoModulo: 'noleggio', status: 'active' } });
  const rentalUser = await db.user.create({ data: { tenantId: rentalTenant.id, email: 'noleggio-browser@verifica.test', passwordHash: 'isolato', role: 'owner', emailVerified: true } });
  await cookie(rentalUser);
  await page('/gestionale/ormeggio', 'Buongiorno');
  check('azienda Noleggio: accesso diretto Ormeggio reindirizzato', await js(`location.pathname === '/gestionale/oggi' && !document.querySelector('aside [aria-label="Modulo"]') && !document.querySelector('aside a[href="/gestionale/ormeggio"]')`));
  console.log(`Browser Ormeggio: ${passed} PASS / 0 FAIL`);
} finally {
  socket?.close();
  if (browser.exitCode === null && browser.pid) {
    const exited = once(browser, "exit"); browser.kill("SIGTERM");
    const force = setTimeout(() => browser.kill("SIGKILL"), 5000);
    await exited; clearTimeout(force);
  }
  await db.$disconnect();
  await rm(profile, { recursive: true, force: true });
}
