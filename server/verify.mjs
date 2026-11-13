import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createWorker} from './worker.mjs';
import MapData from '../dist/mapa/data.js';
const html=readFileSync('dist/index.html','utf8'),map=readFileSync('dist/mapa/index.html','utf8');
assert.match(html,/<a href="\/mapa"><b>3<\/b><span>Mapa das árvores/);
assert(!map.includes('Importar histórico CSV'));
assert(!map.includes('heatCanvas'));
assert.match(map,/script-src 'self';/);
assert([...map.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].every(([,attributes,body])=>/src="\/mapa\/[^"]+"/.test(attributes)&&!body.trim()));
const mapApp=readFileSync('dist/mapa/app.js','utf8');
assert(!mapApp.includes('/api/mapa/cartografia'));
const tileUrl=mapApp.slice(mapApp.indexOf('function esriTileUrl('),mapApp.indexOf('function esriTile(',mapApp.indexOf('function esriTileUrl(')));
const urlFor=runInNewContext(tileUrl+'\nesriTileUrl');
assert.equal(urlFor('server',14,6255,9096),'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/14/9096/6255');
assert.match(map,/<input id="areaToggle" type="checkbox" checked disabled>/);
assert(mapApp.indexOf('renderFences(w,h,hasImagery);')<mapApp.indexOf("const marks=[...view.points]"));
const fences=JSON.parse(readFileSync('server/data/cercas-usiminas.geojson','utf8'));
assert.equal(fences.features.length,224);
assert.equal(new Set(fences.features.map(f=>f.properties.codigo)).size,224);
for(const f of fences.features){
 assert.equal(f.geometry.type,'Polygon');
 for(const ring of f.geometry.coordinates){
  assert.deepEqual(ring[0],ring.at(-1));
  for(const [lon,lat] of ring)assert(lon<-42&&lon>-43&&lat<-19&&lat>-20);
 }
}
const assets=new Map([['/',{body:html,type:'text/html'}],['/mapa',{body:map,type:'text/html'}]]);
const worker=createWorker(assets,fences);
const req=(path,headers={},method='GET')=>new Request('https://example.test'+path,{headers,method});
const viewer={'oai-authenticated-user-id':'allowed-id','oai-authenticated-user-email':'owner@example.test'};
const other={'oai-authenticated-user-id':'other-id','oai-authenticated-user-email':'other@example.test'};
const fixtureKeys=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
const env={ARVORES_MAP_VIEWERS:'owner@example.test',ARVORES_SHEETS_SERVICE_ACCOUNT:JSON.stringify({type:'service_account',client_email:'mapa@test-project.iam.gserviceaccount.com',private_key:fixtureKeys.privateKey.export({type:'pkcs8',format:'pem'})})};
assert.equal((await worker.fetch(req('/'),env)).status,200);
assert.equal((await worker.fetch(req('/mapa'),env)).status,200);
assert.equal((await worker.fetch(req('/api/mapa/historico'),env)).status,401);
assert.equal((await worker.fetch(req('/api/mapa/historico',other),env)).status,403);
assert.equal((await worker.fetch(req('/api/mapa/cartografia'),env)).status,401);
assert.equal((await worker.fetch(req('/api/mapa/cercas'),env)).status,401);
assert.equal((await worker.fetch(req('/api/mapa/cercas',other),env)).status,403);
assert.equal((await worker.fetch(req('/server/data/cercas-usiminas.geojson'),env)).status,404);
const areaResponse=await worker.fetch(req('/api/mapa/cercas',viewer),env);
assert.equal(areaResponse.status,200);
assert.equal(areaResponse.headers.get('cache-control'),'private, no-store');
assert.deepEqual(await areaResponse.json(),fences);

assert.equal((await worker.fetch(req('/api/mapa/historico',viewer,'POST'),env)).status,405);
assert.equal((await worker.fetch(req('/api/mapa/base',viewer),env)).status,503);
assert.equal((await worker.fetch(req('/server/index.js'),env)).status,404);
const labels=['ID da árvore','Unidade / setor / localização','Espécie','Componente avaliado','Local / alvo exposto','Tipo de alvo','Situação dos controles','Data e hora da inspeção','Geometria, alcance e ocupação','R registrado'];
const row=['SIM-A','Setor fictício','Ipê','Tronco','pessoas no restaurante','Pessoas','Exposição inicial','11/11/2026 09:30','Evidência privada\nCoordenadas da árvore (latitude, longitude): -19.470001, -42.540002','R4'];
let keyExposed=false,requests=0,failure='',signedKeyId;
const esriCalls=[];
globalThis.fetch=async (url,opt)=>{
 requests++;
 const u=new URL(url);
 if(u.hostname==='oauth2.googleapis.com'){
  assert.equal(u.pathname,'/token');assert.equal(opt.method,'POST');
  assert.equal(opt.headers['content-type'],'application/x-www-form-urlencoded');
  const jwt=new URLSearchParams(opt.body).get('assertion'),[h,p,s]=jwt.split('.');
  signedKeyId=JSON.parse(Buffer.from(h,'base64url')).kid;
  assert(verify('sha256',Buffer.from(h+'.'+p),fixtureKeys.publicKey,Buffer.from(s,'base64url')));
  const claim=JSON.parse(Buffer.from(p,'base64url'));
  assert.equal(claim.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');
  assert.equal(claim.aud,'https://oauth2.googleapis.com/token');assert.equal(claim.exp-claim.iat,300);
  return failure==='oauth'?Response.json({error:'private-placeholder'},{status:400}):Response.json({access_token:'test-only-token'});
 }
 if(u.hostname==='sheets.googleapis.com'){
  assert.equal(opt.headers.authorization,'Bearer test-only-token');
  assert.deepEqual(u.searchParams.getAll('ranges'),['Historico!E1:K20001','Historico!M1:M20001','Historico!Q1:Q20001','Historico!Z1:Z20001']);
  assert.equal(u.searchParams.get('valueRenderOption'),'FORMATTED_VALUE');
  return failure==='sheets'?Response.json({error:'private-placeholder'},{status:403}):Response.json({valueRanges:[{values:[labels.slice(0,7),row.slice(0,7)]},...[7,8,9].map(i=>({values:[[labels[i]],[row[i]]]}))]});
 }
 if(u.hostname==='maps.googleapis.com'){
  assert.equal(u.searchParams.get('maptype'),'roadmap');
  assert.equal(u.searchParams.get('key'),'synthetic-map-key');
  keyExposed=true;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
 }
 if(u.hostname==='server.arcgisonline.com'){
  const found=/^\/ArcGIS\/rest\/services\/(World_Topo_Map|World_Imagery)\/MapServer\/export$/.exec(u.pathname);
  assert(found);
  esriCalls.push(found[1]);
  assert.equal(u.searchParams.get('bbox'),'-4739983.918,-2216017.978,-4732080.234,-2209641.303');
  assert.equal(u.searchParams.get('bboxSR'),'3857');
  assert.equal(u.searchParams.get('imageSR'),'3857');
  assert.equal(u.searchParams.get('f'),'image');
  assert.equal(opt.headers,undefined);
  if(failure==='esri_all'||(failure==='esri_topo'&&found[1]==='World_Topo_Map'))return Response.json({error:'unavailable'},{status:502});
  return new Response(new Uint8Array(1800),{headers:{'content-type':'image/jpeg'}});
 }
 throw Error('Unexpected upstream');
};
await worker.fetch(req('/api/mapa/historico'),env);
await worker.fetch(req('/api/mapa/historico',other),env);
assert.equal(requests,0);
const history=await worker.fetch(req('/api/mapa/historico',viewer),env);
assert.equal(history.status,200);assert.match(history.headers.get('cache-control'),/no-store/);
const result=await history.json();
const split={...env,ARVORES_SHEETS_SERVICE_ACCOUNT:undefined,ARVORES_SHEETS_CLIENT_EMAIL:'mapa@test-project.iam.gserviceaccount.com',ARVORES_SHEETS_PRIVATE_KEY:fixtureKeys.privateKey.export({type:'pkcs8',format:'pem'})};
assert.equal((await worker.fetch(req('/api/mapa/historico',viewer),{...split,ARVORES_SHEETS_KEY_ID:'a'.repeat(40)})).status,200);
assert.equal(signedKeyId,'a'.repeat(40));
assert.equal((await worker.fetch(req('/api/mapa/historico',viewer),{...split,ARVORES_SHEETS_CLIENT_EMAIL:undefined})).status,503);
assert(!JSON.stringify(result).includes('Avaliador privado'));
assert(!JSON.stringify(result).includes('Evidência privada'));
const records=MapData.readTable(result.table);
assert.deepEqual(records[0].geo,{lat:-19.470001,lon:-42.540002});
assert.equal(records[0].category,'Restaurante, vestiário e vivência');assert.equal(records[0].risk,4);
const basemap='/api/mapa/base?lat=-19.47&lon=-42.54&z=16&w=640&h=400';
assert.equal((await worker.fetch(req(basemap),{...env,ARVORES_GOOGLE_MAPS_KEY:'synthetic-map-key'})).status,401);
assert.equal(keyExposed,false);
const image=await worker.fetch(req(basemap,viewer),{...env,ARVORES_GOOGLE_MAPS_KEY:'synthetic-map-key'});
assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
assert.equal(image.url,'');
const streetImage=await worker.fetch(req('/api/mapa/cartografia',viewer),env);
assert.equal(streetImage.status,200);
assert.equal(streetImage.headers.get('x-cartographic-source'),'esri-topo');
assert.deepEqual(esriCalls,['World_Topo_Map']);
assert.equal((await worker.fetch(req('/api/mapa/cartografia',other),env)).status,403);
assert.equal(esriCalls.length,1);
failure='esri_topo';
const satellite=await worker.fetch(req('/api/mapa/cartografia',viewer),env);
assert.equal(satellite.status,200);
assert.equal(satellite.headers.get('x-cartographic-source'),'esri-imagery');
assert.deepEqual(esriCalls.slice(-2),['World_Topo_Map','World_Imagery']);
failure='esri_all';
const unavailableEsri=await worker.fetch(req('/api/mapa/cartografia',viewer),env);
assert.equal(unavailableEsri.status,502);
assert.deepEqual((await unavailableEsri.json()).providers.map(p=>p.source),['esri-topo','esri-imagery']);
const diagnostics=[], originalError=console.error;
try{
 console.error=(...args)=>diagnostics.push(args);
 for(const [source,stage,status] of [['oauth','oauth_http',400],['sheets','sheets_http',403]]){
  failure=source;
  const unavailable=await worker.fetch(req('/api/mapa/historico',viewer),split);
  assert.equal(unavailable.status,502);
  assert.deepEqual(await unavailable.json(),{code:'history_unavailable',stage,upstreamStatus:status});
  assert.deepEqual(diagnostics.at(-1),['arvores_history',stage,status]);
 }
}finally{console.error=originalError;}
console.log('PASS: avaliação pública, histórico restrito, leitura Google Sheets com escopo somente leitura, projeção mínima da planilha e bases Esri e Google protegidas, com serviços simulados.');
