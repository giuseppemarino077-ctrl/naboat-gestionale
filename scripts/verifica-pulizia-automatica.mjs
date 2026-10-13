import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assicuraDatabaseSmoke } from "./_guardia-ambiente.mjs";
import { pianoPulizia, applicaPulizia } from "./_dati-automatici.mjs";

assicuraDatabaseSmoke("verifica-pulizia-automatica.mjs");
const db=new PrismaClient();
let pass=0;
function check(nome,condizione){assert.ok(condizione,nome);console.log("PASS ",nome);pass++;}
try {
  const stamp=Date.now();
  const auto=await db.tenant.create({data:{nome:"Smoke A Rinominata",status:"active",createdAt:new Date(stamp)}});
  const owner=await db.user.create({data:{tenantId:auto.id,email:`smokea${stamp}@test.local`,role:"owner"}});
  check("pulizia: appartenenza owner presente",await db.appartenenza.count({where:{tenantId:auto.id,userId:owner.id,role:"owner"}})===1);
  await db.boat.create({data:{tenantId:auto.id,nome:"Smoke Boat"}});
  await db.seoPage.create({data:{tenantId:auto.id,tipo:"azienda",refId:auto.id}});
  const audit=await db.auditLog.create({data:{tenantId:auto.id,actorId:owner.id,azione:"tenant.register",entita:"Tenant",entitaId:auto.id}});
  await db.notifica.create({data:{tenantId:auto.id,evento:"test",destinatario:owner.email,oggetto:"Prova",testo:"Prova"}});
  const umano=await db.tenant.create({data:{nome:"Smoke A",status:"active",createdAt:new Date(stamp)}});
  await db.user.create({data:{tenantId:umano.id,email:`umano-${stamp}@example.it`,role:"owner"}});
  const barca=await db.boat.create({data:{tenantId:umano.id,nome:"Smoke Boat"}});
  const seoOrfana=await db.seoPage.create({data:{tenantId:umano.id,tipo:"barca",refId:`orfana-${stamp}`,titoloAuto:`SMOKE-${stamp}-Nol in affitto`,slug:`smoke-${stamp}-nol-orfana`,creatoAt:new Date(stamp)}});
  const seoUmana=await db.seoPage.create({data:{tenantId:umano.id,tipo:"barca",refId:`umana-${stamp}`,titoloAuto:`SMOKE-${stamp}-Nol in affitto`,slug:`smoke-${stamp}-nol-umana`,titolo:"Titolo modificato da una persona",creatoAt:new Date(stamp)}});
  const seoEsistente=await db.seoPage.create({data:{tenantId:umano.id,tipo:"barca",refId:barca.id,titoloAuto:`SMOKE-${stamp}-Nol in affitto`,slug:`smoke-${stamp}-nol-esistente`,creatoAt:new Date(stamp)}});
  const contact=await db.richiestaContatto.create({data:{nome:"Mario",cognome:"Prova",telefono:"333 1234567",email:`contatti${stamp}@test.local`,messaggio:"Cerco una barca per 8 persone il 15 agosto.",privacyAt:new Date(),createdAt:new Date(stamp)}});
  const humanContact=await db.richiestaContatto.create({data:{nome:"Mario",cognome:"Prova",telefono:"333 1234567",email:`umano-${stamp}@example.it`,privacyAt:new Date()}});
  const client=await db.clienteAccount.create({data:{email:`cliente${stamp}@test.local`,nome:"Cliente Smoke M07",passwordHash:"temporaneo",createdAt:new Date(stamp)}});
  await db.backupSettings.upsert({where:{id:"singleton"},create:{id:"singleton"},update:{}});
  const backup=await db.backupRun.create({data:{settingsId:"singleton",esito:"ok",file:"naboat-completo-test.tar.gz",messaggio:"backup di prova",dimensioneByte:3456789}});
  const realBackup=await db.backupRun.create({data:{settingsId:"singleton",esito:"ok",file:"backup-umano.tar.gz",dimensioneByte:3456789}});
  const before=await db.tenant.count();
  const piano=await pianoPulizia(db);
  check("pulizia: anteprima conserva tutti i dati",await db.tenant.count()===before && !!await db.richiestaContatto.findUnique({where:{id:contact.id}}));
  check("pulizia: firme automatiche identificate",piano.ids.tenant.includes(auto.id)&&piano.ids.richiestaContatto.includes(contact.id)&&piano.ids.clienteAccount.includes(client.id)&&piano.ids.backupRun.includes(backup.id));
  check("pulizia: dati umani con nomi Smoke conservati",!piano.ids.tenant.includes(umano.id)&&!piano.ids.richiestaContatto.includes(humanContact.id)&&!piano.ids.backupRun.includes(realBackup.id));
  check("pulizia: SEO automatica orfana distinta da pagine umane ed esistenti",piano.ids.seoPage.includes(seoOrfana.id)&&!piano.ids.seoPage.includes(seoUmana.id)&&!piano.ids.seoPage.includes(seoEsistente.id));
  const shared=await db.tenant.create({data:{nome:"Smoke B",createdAt:new Date(stamp+1)}});
  const sharedOwner=await db.user.create({data:{tenantId:shared.id,role:"owner",email:`smokeb${stamp+1}@test.local`}});
  await db.appartenenza.create({data:{tenantId:umano.id,userId:sharedOwner.id,ruoloOrmeggio:"addetto"}});
  const aggiornato=await pianoPulizia(db);
  check("pulizia: identità condivise non eliminate",!aggiornato.ids.tenant.includes(shared.id));
  await assert.rejects(()=>applicaPulizia(db,piano),/dati sono cambiati/); pass++;console.log("PASS  pulizia: anteprima obsoleta rifiutata");
  const rollback={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
    if(key==="tenant")return new Proxy(target.tenant,{get(model,operation){
      if(operation==="deleteMany")return ()=>{throw new Error("arresto simulato");};
      return model[operation];
    }});
    return target[key];
  }})),options)};
  await assert.rejects(()=>applicaPulizia(rollback,aggiornato),/arresto simulato/);
  check("pulizia: errore ripristina anche registro e notifiche",!!await db.auditLog.findUnique({where:{id:audit.id}})&&!!await db.tenant.findUnique({where:{id:auto.id}}));
  await applicaPulizia(db,aggiornato);
  check("pulizia: rimozione completa aziende e riferimenti",!await db.tenant.findUnique({where:{id:auto.id}})&&!await db.auditLog.findUnique({where:{id:audit.id}})&&await db.seoPage.count({where:{tenantId:auto.id}})===0&&await db.notifica.count({where:{tenantId:auto.id}})===0);
  check("pulizia: contatti, clienti e backup fittizi eliminati",!await db.richiestaContatto.findUnique({where:{id:contact.id}})&&!await db.clienteAccount.findUnique({where:{id:client.id}})&&!await db.backupRun.findUnique({where:{id:backup.id}}));
  check("pulizia: barca e contatto umani intatti",!!await db.boat.findUnique({where:{id:barca.id}})&&!!await db.richiestaContatto.findUnique({where:{id:humanContact.id}})&&!!await db.backupRun.findUnique({where:{id:realBackup.id}}));
  check("pulizia: SEO orfana rimossa e modifiche umane conservate",!await db.seoPage.findUnique({where:{id:seoOrfana.id}})&&!!await db.seoPage.findUnique({where:{id:seoUmana.id}})&&!!await db.seoPage.findUnique({where:{id:seoEsistente.id}}));
  check("pulizia: seconda esecuzione senza ulteriori cancellazioni",Object.values((await pianoPulizia(db)).ids).every(ids=>ids.length===0));
  console.log(`Pulizia automatica: ${pass} PASS, 0 FAIL`);
}finally{await db.$disconnect();}
