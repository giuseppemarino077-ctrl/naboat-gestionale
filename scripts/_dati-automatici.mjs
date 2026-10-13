const firmeAzienda = [
  [/^Smoke A(?: Rinominata)?$/, /^smokea(\d{13})@test\.local$/i],
  [/^Smoke B$/, /^smokeb(\d{13})@test\.local$/i],
  [/^Parse Test$/, /^parse(\d{13})@test\.local$/i],
  [/^Webhook Test$/, /^wh(\d{13})@test\.local$/i],
  [/^Conc(?: \d{13})?$/, /^conc(\d{13})@test\.local$/i],
];

export function emailAutomatica(email) {
  return /^(?:smoke[ab]|skipper|parse|wh|conc)\d{13}@test\.local$/i.test(email);
}

function vicinoAllaCreazione(email, espressione, createdAt) {
  const match = email.match(espressione);
  return !!match && Math.abs(new Date(createdAt).getTime() - Number(match[1])) < 60000;
}

export function aziendaAutomatica(tenant) {
  const firma = firmeAzienda.find(([nome]) => nome.test(tenant.nome));
  return !!firma && tenant.users.some(u => u.role === "owner" && vicinoAllaCreazione(u.email, firma[1], tenant.createdAt))
    && tenant.users.every(u => emailAutomatica(u.email) && u.role !== "superadmin")
    && tenant.appartenenze.every(m => emailAutomatica(m.user.email) && m.user.tenantId === tenant.id)
    && tenant.users.every(u => u.appartenenze.every(m => m.tenantId === tenant.id));
}

export function contattoAutomatico(c) {
  return c.nome === "Mario" && c.cognome === "Prova" && c.telefono.replace(/\s/g, "") === "3331234567"
    && c.messaggio?.startsWith("Cerco una barca per 8 persone il 15 agosto.")
    && vicinoAllaCreazione(c.email, /^contatti(\d{13})@test\.local$/, c.createdAt);
}

export function clienteAutomatico(c, tenantIds) {
  return c.nome === "Cliente Smoke M07"
    && vicinoAllaCreazione(c.email, /^cliente(\d{13})@test\.local$/, c.createdAt)
    && [...c.bookings, ...c.recensioni].every(r => tenantIds.has(r.tenantId));
}

export function seoAutomaticoOrfano(pagina, barcaEsistente) {
  const marker = pagina.titoloAuto?.match(/^(SMOKE-(\d{13})-Nol)\b/);
  return !!marker && !barcaEsistente && !!pagina.refId && !!pagina.tenantId
    && pagina.tipo === "barca" && !pagina.titolo && !pagina.descrizione && !pagina.keywords
    && pagina.slug?.startsWith(`${marker[1].toLowerCase()}-`)
    && Math.abs(pagina.creatoAt.getTime() - Number(marker[2])) < 60000;
}

async function riferimentiOrfani(db) {
  const pagine = await db.seoPage.findMany({where:{tipo:"barca",titoloAuto:{startsWith:"SMOKE-"}},select:{id:true,tipo:true,tenantId:true,refId:true,titoloAuto:true,titolo:true,descrizione:true,keywords:true,slug:true,creatoAt:true}});
  const tenantIds = [...new Set(pagine.map(p=>p.tenantId).filter(Boolean))];
  const barche = new Set((await db.boat.findMany({where:{tenantId:{in:tenantIds},id:{in:pagine.map(p=>p.refId).filter(Boolean)}},select:{id:true}})).map(b=>b.id));
  const seo = pagine.filter(p=>seoAutomaticoOrfano(p,barche.has(p.refId)));
  const audit = await db.auditLog.findMany({where:{tenantId:{in:tenantIds}},select:{id:true,tenantId:true,actorId:true,azione:true,entita:true,entitaId:true,createdAt:true},orderBy:{createdAt:"asc"}});
  const azioni = ["ormeggio.area.create","ormeggio.proprietario.create","ormeggio.proprietario.create","ormeggio.permanenza.create","ormeggio.attivita.crea","ormeggio.attivita.completato","ormeggio.incasso.manuale","ormeggio.movimento.uscita","ormeggio.attivita.completato","ormeggio.attivita.rettifica","ormeggio.attivita.storno","ormeggio.permanenza.create","ormeggio.area.create","ormeggio.permanenza.create","ormeggio.permanenza.sposta","ormeggio.permanenza.chiudi","boat.create","ormeggio.permanenza.create","ormeggio.contratto.create","ormeggio.contratto.firmato"];
  const varianti = [[...azioni.slice(0,18),"ormeggio.permanenza.create",...azioni.slice(18)],azioni];
  const gruppi = [];
  for (const p of seo) {
    const stamp = Number(p.titoloAuto.match(/^SMOKE-(\d{13})/)[1]);
    const righe = audit.filter(a=>a.tenantId===p.tenantId && a.createdAt.getTime()>=stamp && a.createdAt.getTime()<stamp+60000);
    for (let i=0;i<righe.length;i++) for (const firma of varianti) {
      const gruppo = righe.slice(i,i+firma.length);
      if (gruppo.length!==firma.length || !gruppo.some(a=>a.azione==="boat.create" && a.entitaId===p.refId)) continue;
      if (gruppo.every((a,j)=>a.azione===firma[j] && (a.actorId===gruppo[0].actorId || (!a.actorId && a.azione==="ormeggio.contratto.firmato")) && a.entitaId)) gruppi.push(gruppo);
    }
  }
  const esistenti = new Set();
  for (const [entita,modello] of [["Area","area"],["Proprietario","proprietario"],["Permanenza","permanenza"],["Attivita","attivita"],["Boat","boat"]]) {
    const ids = gruppi.flat().filter(a=>a.entita===entita).map(a=>a.entitaId);
    for (const row of await db[modello].findMany({where:{tenantId:{in:tenantIds},id:{in:ids}},select:{id:true}})) esistenti.add(row.id);
  }
  const registro = gruppi.filter(g=>g.every(a=>!esistenti.has(a.entitaId))).flat();
  return {seo,registro};
}

export async function pianoPulizia(db) {
  const tenants = await db.tenant.findMany({
    select: {
      id:true,nome:true,createdAt:true,
      users: { select: { id:true,email:true,role:true,appartenenze:{select:{tenantId:true}} } },
      appartenenze: { select: { user:{select:{email:true,tenantId:true}} } },
      boats: {select:{nome:true,createdAt:true}},
    },
    orderBy: { id:"asc" },
  });
  const candidate = tenants.filter(aziendaAutomatica);
  const autori = await db.user.findMany({where:{role:"superadmin"},select:{id:true}});
  const attoriAmmessi = new Set([...autori.map(u=>u.id),...candidate.flatMap(t=>t.users.map(u=>u.id))]);
  const audit = await db.auditLog.findMany({where:{tenantId:{in:candidate.map(t=>t.id)}},select:{tenantId:true,actorId:true,azione:true,createdAt:true}});
  const automatiche = candidate.filter(t => {
    const prefisso = t.nome.startsWith("Smoke") ? /^Smoke / : t.nome === "Parse Test" ? /^Parse Boat$/ : t.nome === "Webhook Test" ? /^Wh Boat$/ : /^Barca Conc$/;
    return t.boats.every(b => prefisso.test(b.nome) && b.createdAt.getTime() - t.createdAt.getTime() < 3600000)
      && audit.filter(a=>a.tenantId===t.id).every(a => !a.actorId || attoriAmmessi.has(a.actorId));
  });
  const tenantIds = new Set(automatiche.map(t => t.id));
  const clienti = (await db.clienteAccount.findMany({select:{id:true,email:true,nome:true,createdAt:true,bookings:{select:{tenantId:true}},recensioni:{select:{tenantId:true}}}}))
    .filter(c => clienteAutomatico(c, tenantIds));
  const contatti = (await db.richiestaContatto.findMany({select:{id:true,nome:true,cognome:true,email:true,telefono:true,messaggio:true,createdAt:true}})).filter(contattoAutomatico);
  const backup = await db.backupRun.findMany({where:{file:"naboat-completo-test.tar.gz",messaggio:"backup di prova",dimensioneByte:3456789,esito:"ok"},select:{id:true}});
  const utenti = automatiche.flatMap(t => t.users);
  const patenti = await db.patenteNautica.findMany({where:{accountId:{in:clienti.map(c=>c.id)}},select:{id:true}});
  const entityIds = [...tenantIds,...clienti.map(c=>c.id),...backup.map(b=>b.id),...patenti.map(p=>p.id)];
  const whereTenant = {tenantId:{in:[...tenantIds]}};
  const orfani = await riferimentiOrfani(db);
  const seo = [...await db.seoPage.findMany({where:whereTenant,select:{id:true}}),...orfani.seo];
  const modelli = await db.modelloBarca.findMany({where:{creatoDaTenantId:{in:[...tenantIds]},boats:{every:whereTenant}},select:{id:true}});
  const notifiche = await db.notifica.findMany({where:{OR:[whereTenant,{destinatario:{in:[...utenti.map(u=>u.email),...clienti.map(c=>c.email)]}}]},select:{id:true}});
  const registro = [...await db.auditLog.findMany({where:{OR:[whereTenant,{tenantId:null,entitaId:{in:entityIds}}]},select:{id:true}}),...orfani.registro];
  const stripe = await db.stripeEvent.findMany({where:whereTenant,select:{id:true}});
  const ids = rows => [...new Set(rows.map(r=>r.id))].sort();
  return {
    ids:{tenant:ids(automatiche),clienteAccount:ids(clienti),richiestaContatto:ids(contatti),backupRun:ids(backup),seoPage:ids(seo),modelloBarca:ids(modelli),notifica:ids(notifiche),auditLog:ids(registro),stripeEvent:ids(stripe)},
    aziendeRimosse:automatiche.map(t=>({id:t.id,nome:t.nome})),
    aziendeConservate:tenants.filter(t=>!tenantIds.has(t.id)).map(t=>({id:t.id,nome:t.nome})),
  };
}

export async function applicaPulizia(db, previsto) {
  return db.$transaction(async tx => {
    const corrente = await pianoPulizia(tx);
    if (JSON.stringify(corrente) !== JSON.stringify(previsto)) throw new Error("I dati sono cambiati: ripetere l’anteprima prima di cancellare.");
    const rimossi = {};
    for (const modello of ["auditLog","notifica","stripeEvent","seoPage","modelloBarca","backupRun","tenant","clienteAccount","richiestaContatto"]) {
      rimossi[modello] = (await tx[modello].deleteMany({where:{id:{in:corrente.ids[modello]}}})).count;
    }
    return rimossi;
  }, {isolationLevel:"Serializable",timeout:60000,maxWait:10000});
}
