import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession, createSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { requireTenant, isOwnerOrSuperadmin, mustTwoFa } from "@/modules/piattaforma/accesso-azienda";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { sendMail, smtpConfigured, escapeHtml } from "@/lib/mailer";

const ruolo = z.enum(["responsabile", "addetto"]);
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const invitoVisibile = { id: true, email: true, nome: true, ruoloOrmeggio: true, vedeImporti: true, scadeAt: true, accettatoAt: true, revocatoAt: true, createdAt: true } as const;

async function titolare(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t;
  if (!isOwnerOrSuperadmin(t.role) || !t.accessoOrmeggio) return { error: fail("Riservato al titolare del modulo Ormeggio", 403) };
  return t;
}

async function persona() {
  const s = await getSession();
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.sub } });
  return u && u.sessionVersion === (s.ver ?? 0) ? { u, s } : null;
}

export async function elenco(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  if (!t.accessoOrmeggio || (!isOwnerOrSuperadmin(t.role) && t.ruoloOrmeggio !== "responsabile")) return fail("Permesso negato", 403);
  const owner = isOwnerOrSuperadmin(t.role);
  const [membri, inviti] = await Promise.all([
    prisma.appartenenza.findMany({ where: { tenantId: t.tenantId, ...(owner ? {} : { stato: "attiva" as const }) }, include: { user: { select: { id: true, nome: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    owner ? prisma.collaboratoreInvito.findMany({ where: { tenantId: t.tenantId }, select: invitoVisibile, orderBy: { createdAt: "desc" }, take: 100 }) : [],
  ]);
  return ok({ membri: membri.map((m) => owner ? m : { id: m.id, userId: m.userId, user: { id: m.user.id, nome: m.user.nome }, stato: m.stato }), inviti });
}

export async function invita(req: Request) {
  const t = await titolare(req);
  if ("error" in t) return t.error;
  if (!(await rateLimit(`rl:inviti:${t.tenantId}`, 30, 3600)).ok) return fail("Troppi inviti: riprova più tardi", 429);
  const p = z.object({ email: z.string().trim().email().transform((v) => v.toLowerCase()), nome: z.string().trim().min(2).max(120), ruoloOrmeggio: ruolo, vedeImporti: z.boolean().default(false) }).strict().safeParse(await req.json().catch(() => null));
  if (!p.success || (p.data.ruoloOrmeggio !== "responsabile" && p.data.vedeImporti)) return fail("Dati o permessi non validi", 422);
  const token = randomBytes(32).toString("base64url");
  const data = p.data;
  try {
    const invito = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${t.tenantId} FOR UPDATE`;
      const member = await tx.appartenenza.findFirst({ where: { tenantId: t.tenantId, user: { email: data.email }, stato: { not: "rimossa" } } });
      if (member) throw new Error("gia_membro");
      const old = await tx.collaboratoreInvito.findFirst({ where: { tenantId: t.tenantId, email: data.email, accettatoAt: null, revocatoAt: null } });
      if (old && old.scadeAt > new Date()) throw new Error("invito_attivo");
      await tx.collaboratoreInvito.updateMany({ where: { tenantId: t.tenantId, email: data.email, accettatoAt: null, revocatoAt: null }, data: { revocatoAt: new Date() } });
      const created = await tx.collaboratoreInvito.create({ data: { ...data, tenantId: t.tenantId, tokenHash: digest(token), scadeAt: new Date(Date.now() + 7 * 86400000), creatoDa: t.userId }, select: invitoVisibile });
      await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "collaboratore.invito", entita: "CollaboratoreInvito", entitaId: created.id, dettagli: JSON.stringify(data) } });
      return created;
    });
    const link = `${process.env.APP_URL || "http://localhost:3000"}/gestionale/invito?token=${encodeURIComponent(token)}`;
    const esito = smtpConfigured() ? await sendMail(data.email, "Invito a collaborare su NaBoat", `Sei stato invitato su NaBoat. Accetta entro 7 giorni:\n${link}\nSe hai già un account, accedi con la tua email.`, `<p>Sei stato invitato su NaBoat. Accetta entro 7 giorni:</p><p><a href="${escapeHtml(link)}">Accetta invito</a></p><p>Se hai già un account, accedi con la tua email.</p>`) : { sent: false, configurato: false };
    return ok({ invito, link, inviato: esito.sent, messaggio: esito.sent ? "Invito inviato via email" : "Invito creato, email non inviata. Puoi copiare il link e consegnarlo al collaboratore." }, 201);
  } catch (e) {
    if (e instanceof Error && ["gia_membro", "invito_attivo"].includes(e.message)) return fail(e.message === "gia_membro" ? "Questa persona appartiene già all'azienda" : "Esiste già un invito attivo: revocalo prima di crearne un altro", 409);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Invito già presente", 409);
    throw e;
  }
}

export async function modifica(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await titolare(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = z.object({ revisione: z.number().int().positive(), role: z.enum(["owner", "operatore"]).optional(), ruoloOrmeggio: ruolo.optional(), vedeImporti: z.boolean().optional(), stato: z.enum(["attiva", "sospesa", "rimossa"]).optional() }).strict().safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi: ricarica l'elenco prima di modificare", 422);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${t.tenantId} FOR UPDATE`;
      const cur = await tx.appartenenza.findFirst({ where: { id, tenantId: t.tenantId } });
      if (!cur) throw new Error("non_trovato");
      if (cur.revisione !== p.data.revisione) throw new Error("conflitto");
      const { revisione: _v, ...data } = p.data;
      const finalRole = data.role ?? cur.role;
      const finalProfile = data.ruoloOrmeggio ?? cur.ruoloOrmeggio;
      if (finalRole !== "owner" && finalProfile === "visualizzazione" && (data.stato === "attiva" || data.role === "operatore")) throw new Error("profilo_rimosso");
      if (finalRole !== "owner" && finalProfile !== "responsabile") data.vedeImporti = false;
      if (finalRole === "owner") data.vedeImporti = true;
      const upd = await tx.appartenenza.update({ where: { id: cur.id }, data: { ...data, revisione: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "collaboratore.modifica", entita: "Appartenenza", entitaId: cur.id, dettagli: JSON.stringify({ prima: cur, dopo: upd }) } });
    });
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "non_trovato") return fail("Collaboratore non trovato", 404);
    if (msg === "conflitto") return fail("Questo collaboratore è stato modificato: ricarica l'elenco", 409);
    if (msg === "profilo_rimosso") return fail("Scegli Responsabile o Addetto per assegnare un profilo valido", 422);
    if (msg.includes("ultimo_titolare_attivo")) return fail("Deve restare almeno un titolare attivo", 409);
    throw e;
  }
}

export async function revocaInvito(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await titolare(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const changed = await prisma.$transaction(async (tx) => {
    const r = await tx.collaboratoreInvito.updateMany({ where: { id, tenantId: t.tenantId, accettatoAt: null, revocatoAt: null }, data: { revocatoAt: new Date() } });
    if (r.count) await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "collaboratore.invito_revocato", entita: "CollaboratoreInvito", entitaId: id } });
    return r.count;
  });
  return changed ? ok({ ok: true }) : fail("Invito non trovato o non più attivo", 404);
}

export async function informazioniInvito(req: Request) {
  if (!(await rateLimit(`rl:invito-info:${clientIp(req)}`, 30, 600)).ok) return fail("Troppi tentativi", 429);
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length > 200) return fail("Invito non valido", 422);
  const i = await prisma.collaboratoreInvito.findUnique({ where: { tokenHash: digest(token) }, include: { tenant: { select: { nome: true, status: true } } } });
  if (!i || i.revocatoAt || i.accettatoAt || i.scadeAt <= new Date()) return fail("Invito scaduto, revocato o già utilizzato", 404);
  if (i.ruoloOrmeggio === "visualizzazione") return fail("Questo profilo non è più disponibile. Chiedi al titolare un nuovo invito", 404);
  const user = await prisma.user.findUnique({ where: { email: i.email }, select: { id: true } });
  const who = await persona();
  return ok({ azienda: i.tenant.nome, email: i.email, nome: i.nome, ruolo: i.ruoloOrmeggio, esistente: !!user, autenticato: who?.u.email === i.email && who.u.emailVerified, altroAccount: !!who && who.u.email !== i.email });
}

export async function accettaInvito(req: Request) {
  if (!(await rateLimit(`rl:invito-accetta:${clientIp(req)}`, 15, 600)).ok) return fail("Troppi tentativi", 429);
  const p = z.object({ token: z.string().min(20).max(200), password: z.string().min(10).max(128).optional() }).strict().safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const hashed = digest(p.data.token);
  const exists = await prisma.collaboratoreInvito.findUnique({ where: { tokenHash: hashed }, select: { id: true } });
  if (!exists) return null;
  const who = await persona();
  const passwordHash = p.data.password ? await hashPassword(p.data.password) : null;
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CollaboratoreInvito" WHERE "tokenHash" = ${hashed} FOR UPDATE`;
      const i = rows[0] ? await tx.collaboratoreInvito.findUnique({ where: { id: rows[0].id }, include: { tenant: true } }) : null;
      if (!i || i.revocatoAt || i.accettatoAt || i.scadeAt <= new Date() || i.ruoloOrmeggio === "visualizzazione") throw new Error("invito_non_valido");
      if (i.tenant.status !== "active") throw new Error("azienda_non_attiva");
      let u = await tx.user.findUnique({ where: { email: i.email } });
      if (who && who.u.email !== i.email) throw new Error("identita");
      if (u) {
        if (!who || who.u.id !== u.id || !u.emailVerified) throw new Error("identita");
      } else {
        if (!passwordHash) throw new Error("password");
        u = await tx.user.create({ data: { email: i.email, nome: i.nome, passwordHash, emailVerified: true, vedeImporti: false } });
      }
      const cur = await tx.appartenenza.findUnique({ where: { tenantId_userId: { tenantId: i.tenantId, userId: u.id } } });
      if (cur && cur.stato !== "rimossa") throw new Error("gia_membro");
      const data = { role: "operatore" as const, ruoloOrmeggio: i.ruoloOrmeggio, vedeImporti: i.vedeImporti, accessoOrmeggio: true, accessoNoleggio: false, stato: "attiva" as const };
      await tx.appartenenza.upsert({ where: { tenantId_userId: { tenantId: i.tenantId, userId: u.id } }, create: { ...data, tenantId: i.tenantId, userId: u.id }, update: { ...data, revisione: { increment: 1 } } });
      await tx.collaboratoreInvito.update({ where: { id: i.id }, data: { accettatoAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId: i.tenantId, actorId: u.id, azione: "collaboratore.invito_accettato", entita: "CollaboratoreInvito", entitaId: i.id, dettagli: JSON.stringify({ userId: u.id, ruolo: i.ruoloOrmeggio }) } });
    });
    return ok({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "identita") return fail("Accedi con l'account dell'indirizzo invitato e verifica la tua email", 403);
    if (m === "password") return fail("Scegli una password di almeno 10 caratteri", 422);
    if (m === "azienda_non_attiva") return fail("Azienda non attiva", 403);
    if (["invito_non_valido", "gia_membro"].includes(m) || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) return fail("Invito non valido, già utilizzato o accesso già presente", 409);
    throw e;
  }
}

export async function aziende(req: Request) {
  const who = await persona();
  if (!who) return fail("Non autenticato", 401);
  if (req.method === "GET") {
    const memberships = await prisma.appartenenza.findMany({ where: { userId: who.u.id, stato: "attiva" }, select: { tenantId: true, role: true, tenant: { select: { nome: true, status: true } } }, orderBy: { createdAt: "asc" } });
    return ok({ attiva: who.s.tenantId, aziende: memberships });
  }
  const p = z.object({ tenantId: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Azienda non valida", 422);
  const m = await prisma.appartenenza.findUnique({ where: { tenantId_userId: { tenantId: p.data.tenantId, userId: who.u.id } }, include: { tenant: true } });
  if (!m || m.stato !== "attiva" || m.tenant.status !== "active") return fail("Azienda non disponibile", 403);
  if (mustTwoFa(m.role, who.s.twofa)) return fail("2FA obbligatoria", 403);
  await createSession({ ...who.s, tenantId: m.tenantId, role: m.role, tenantStatus: m.tenant.status });
  return ok({ ok: true, destinazione: m.accessoNoleggio ? "/gestionale/oggi" : "/gestionale/ormeggio" });
}
