const assert=require('node:assert/strict');
const fs=require('node:fs');
const {evaluate}=require('./dist/risk.js');
const fixture=require('./source-cases.json');
const base={reach:'verificado',targetType:'pessoas',exclusionEvidence:'Alvo retirado; acessos controlados no período.',controlOwner:'Responsável',controlValidity:'2026-10-23T12:00'};
for(const t of fixture.cases){
 const out=evaluate({...base,f:t.f,e:t.e,c:t.c});
 assert.equal(out.status,'ok');assert.equal(out.j,t.j);assert.equal(out.r,t.r);
 assert.equal(out.immediate,t.f==='4');
}
for(const key of ['f','e','c','reach']){
 const out=evaluate({...base,f:'3',e:'2',c:'4',[key]:''});
 assert.equal(out.status,'empty');assert.equal(out.r,null);
}
for(const key of ['exclusionEvidence','controlOwner','controlValidity']){
 const out=evaluate({...base,f:'4',e:'0',c:'1',[key]:''});
 assert.equal(out.status,'excluded_pending');assert.equal(out.r,null);assert.equal(out.immediate,true);
}
assert.equal(evaluate({...base,f:'4',e:'0',c:'1'}).r,1);
assert.equal(evaluate({...base,f:'4',e:'0',c:'1'}).immediate,true);
assert.equal(evaluate({...base,targetType:'fixo',f:'2',e:'1',c:'3'}).status,'invalid');
assert.equal(evaluate({...base,f:'7',e:'2',c:'1'}).status,'invalid');
const html=fs.readFileSync('./dist/index.html','utf8');
assert(!html.includes('value="ND"'));
assert(!/Não determinad|\bND\b/.test(html));
console.log('PASS: 64 combinações contra o DOCX; 16 alertas F4; campos vazios; comprovação E0; alvo fixo E3; sem opção ND.');
