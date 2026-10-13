import test from "node:test";
import assert from "node:assert/strict";
import { aziendaAutomatica, clienteAutomatico, contattoAutomatico, seoAutomaticoOrfano } from "./_dati-automatici.mjs";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const stamp = 1791043800000;
const fixture = () => ({ id:"auto",nome:"Smoke A Rinominata",createdAt:new Date(stamp+100),users:[{role:"owner",email:`smokea${stamp}@test.local`,appartenenze:[{tenantId:"auto"}]}],appartenenze:[] });
test("firme combinate: il solo nome Smoke o il dominio test non autorizzano cancellazioni", () => {
  assert.equal(aziendaAutomatica(fixture()),true);
  for (const nome of ["Smoke Charter","Test umano","Demo Charter Napoli"]) assert.equal(aziendaAutomatica({...fixture(),nome}),false);
  const umana=fixture(); umana.users[0].email="titolare@example.it";
  assert.equal(aziendaAutomatica(umana),false);
  assert.equal(aziendaAutomatica({...fixture(),createdAt:new Date(stamp+86400000)}),false);
});
test("appartenenze umane e identità condivise conservate", () => {
  const condivisa=fixture(); condivisa.users[0].appartenenze.push({tenantId:"umana"});
  assert.equal(aziendaAutomatica(condivisa),false);
  const umana=fixture(); umana.appartenenze.push({user:{email:"persona@example.it",tenantId:"umana"}});
  assert.equal(aziendaAutomatica(umana),false);
});
test("clienti automatici collegati a dati umani conservati", () => {
  const c={nome:"Cliente Smoke M07",email:`cliente${stamp}@test.local`,createdAt:new Date(stamp),bookings:[],recensioni:[]};
  assert.equal(clienteAutomatico(c,new Set()),true);
  assert.equal(clienteAutomatico({...c,bookings:[{tenantId:"umana"}]},new Set()),false);
  assert.equal(clienteAutomatico({...c,email:"cliente@demo.naboat.it"},new Set()),false);
});
test("contatti riconosciuti con dati e istante precisi", () => {
  const c={nome:"Mario",cognome:"Prova",telefono:"333 1234567",email:`contatti${stamp}@test.local`,createdAt:new Date(stamp),messaggio:"Cerco una barca per 8 persone il 15 agosto. Guardate"};
  assert.equal(contattoAutomatico(c),true);
  assert.equal(contattoAutomatico({...c,email:"mario@example.it"}),false);
  assert.equal(contattoAutomatico({...c,messaggio:"La mia richiesta personale"}),false);
});
test("SEO orfana: firma automatica richiesta, barche esistenti e modifiche umane conservate", () => {
  const p={tipo:"barca",tenantId:"demo",refId:"eliminata",titoloAuto:`SMOKE-${stamp}-Nol in affitto`,slug:`smoke-${stamp}-nol-demo`,creatoAt:new Date(stamp+100)};
  assert.equal(seoAutomaticoOrfano(p,false),true);
  assert.equal(seoAutomaticoOrfano(p,true),false);
  assert.equal(seoAutomaticoOrfano({...p,titolo:"Titolo inserito da una persona"},false),false);
  assert.equal(seoAutomaticoOrfano({...p,titoloAuto:"Smoke Boat"},false),false);
});
test("smoke bloccati su account persistenti, online, URL sbagliato o senza runner", () => {
  const chiavi=["DATABASE_URL","NABOAT_TEST_DATABASE","NABOAT_TEST_BASE_URL"];
  const prima=Object.fromEntries(chiavi.map(k=>[k,process.env[k]]));
  try {
    const db="naboat_verifica_0123456789abcdef";
    Object.assign(process.env,{DATABASE_URL:`postgresql://u:p@127.0.0.1:5432/${db}`,NABOAT_TEST_DATABASE:db,NABOAT_TEST_BASE_URL:"http://127.0.0.1:34567/"});
    assert.doesNotThrow(()=>assicuraAmbienteSmoke("test","http://127.0.0.1:34567"));
    for(const base of ["http://localhost:3000","https://naboat.it","http://127.0.0.1:34568"]) assert.throws(()=>assicuraAmbienteSmoke("test",base));
    for(const url of ["postgresql://u:p@127.0.0.1/naboat","postgresql://u:p@127.0.0.1/naboat_verifica_demo",`postgresql://u:p@db.example/${db}`]) {
      process.env.DATABASE_URL=url;
      assert.throws(()=>assicuraAmbienteSmoke("test","http://127.0.0.1:34567"));
    }
    process.env.DATABASE_URL=`postgresql://u:p@127.0.0.1:5432/${db}`;
    delete process.env.NABOAT_TEST_BASE_URL;
    assert.throws(()=>assicuraAmbienteSmoke("test","http://127.0.0.1:34567"));
  } finally { for(const k of chiavi) if(prima[k]===undefined) delete process.env[k]; else process.env[k]=prima[k]; }
});
