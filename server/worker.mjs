const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
const signIn='/signin-with-chatgpt?return_to=%2Fmapa';
const encoder=new TextEncoder();
function owner(request,env){
 const id=request.headers.get('oai-authenticated-user-id');
 const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!id||!email)return 401;
 const allowed=String(env.ARVORES_MAP_VIEWERS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 return allowed.includes(email)?200:403;
}
const spreadsheetId='198DHEgxvkQitEH6tACaQ8EmvsV2NAkI6KfNyfWu-4mk';
const historyColumns=['ID da árvore','Unidade / setor / localização','Espécie','Componente avaliado','Local / alvo exposto','Tipo de alvo','Situação dos controles','Data e hora da inspeção','Geometria, alcance e ocupação','R registrado'];
const oauthUrl='https://oauth2.googleapis.com/token';
class HistoryFailure extends Error {
 constructor(stage,status){super(stage);this.stage=stage;this.status=status;}
}
function networkStage(prefix,error){
 const m=String(error?.message||'');
 const reason=/timeout|aborted/i.test(m)?'timeout':/not allowed|forbidden|restricted|blocked|policy|denied/i.test(m)?'blocked':
  /redirect/i.test(m)?'redirect':/dns|resolve|enotfound/i.test(m)?'dns':/ssl|tls|certificat/i.test(m)?'tls':
  /subrequest|limit|budget/i.test(m)?'limit':/signal/i.test(m)?'signal':/invalid|unsupported|typeerror/i.test(m)?'request':/socket|reset|connect/i.test(m)?'connection':'network';
 return new HistoryFailure(prefix+'_'+reason);
}
function url64(bytes){
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
const json64=data=>url64(encoder.encode(JSON.stringify(data)));
async function tokenFor(account){
 const pem=account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const pkcs8=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',pkcs8,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']).catch(()=>{throw new HistoryFailure('key_import');});
 const now=Math.floor(Date.now()/1000);
 const keyId=String(account.private_key_id||'').trim();
 if(keyId&&!/^[a-f0-9]{40}$/i.test(keyId))throw new HistoryFailure('key_id');
 const message=json64({alg:'RS256',typ:'JWT',...(keyId?{kid:keyId}:{})})+'.'+json64({iss:account.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:oauthUrl,iat:now,exp:now+300});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(message));
 const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:message+'.'+url64(new Uint8Array(sig))});
 const response=await fetch(oauthUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString(),redirect:'manual'}).catch(error=>{throw networkStage('oauth',error);});
 if(!response.ok){
  const reply=await response.json().catch(()=>null);
  const desc=String(reply?.error_description||'');
  const hint=/signature/i.test(desc)?'oauth_signature':/clock|short-lived|timeframe|iat|exp claim/i.test(desc)?'oauth_time':
   ['invalid_grant','invalid_client','unauthorized_client','invalid_scope'].includes(reply?.error)?'oauth_'+reply.error:'oauth_http';
  throw new HistoryFailure(hint,response.status);
 }
 const result=await response.json().catch(()=>{throw new HistoryFailure('oauth_response');});
 if(typeof result.access_token!=='string'||!result.access_token)throw new HistoryFailure('oauth_response');
 return result.access_token;
}
async function history(env){
 const account=env.ARVORES_SHEETS_SERVICE_ACCOUNT?JSON.parse(env.ARVORES_SHEETS_SERVICE_ACCOUNT):{
  type:'service_account',client_email:env.ARVORES_SHEETS_CLIENT_EMAIL,private_key:env.ARVORES_SHEETS_PRIVATE_KEY,private_key_id:env.ARVORES_SHEETS_KEY_ID
 };
 if(account.type!=='service_account'||!/^[-a-z0-9.]+@[-a-z0-9.]+\.iam\.gserviceaccount\.com$/.test(account.client_email||'')||typeof account.private_key!=='string')return json({code:'not_configured'},503);
 const token=await tokenFor(account),signal=AbortSignal.timeout(15000);
 const endpoint=new URL('https://sheets.googleapis.com/v4/spreadsheets/'+spreadsheetId+'/values:batchGet');
 endpoint.searchParams.set('valueRenderOption','FORMATTED_VALUE');
 for(const range of ['E1:K20001','M1:M20001','Q1:Q20001','Z1:Z20001'])endpoint.searchParams.append('ranges','Historico!'+range);
 const response=await fetch(endpoint,{headers:{authorization:'Bearer '+token},redirect:'manual',signal}).catch(error=>{throw networkStage('sheets',error);});
 if(!response.ok)throw new HistoryFailure('sheets_http',response.status);
 const result=await response.json().catch(()=>{throw new HistoryFailure('sheets_response');});
 if(!Array.isArray(result.valueRanges)||result.valueRanges.length!==4)throw new HistoryFailure('sheets_response');
 const ranges=result.valueRanges.map(r=>r.values||[]);
 const [main,date,geometry,risk]=ranges;
 const combine=i=>[...Array.from({length:7},(_,j)=>main[i]?.[j]??''),date[i]?.[0]??'',geometry[i]?.[0]??'',risk[i]?.[0]??''].map(String);
 if(historyColumns.some((h,i)=>combine(0)[i]!==h))throw new HistoryFailure('sheets_columns');
 const table=[historyColumns];
 for(let i=1;i<main.length&&i<20001;i++){
  if(!String(main[i]?.[0]??'').trim())continue;
  const row=combine(i),geo=row[8].match(/Coordenadas da árvore \(latitude, longitude\):\s*([+−-]?\d{1,3}(?:[.,]\d{1,12})?)\s*(?:;\s*|,\s+)([+−-]?\d{1,3}(?:[.,]\d{1,12})?)/i);
  row[8]=geo?'Coordenadas da árvore (latitude, longitude): '+geo[1]+'; '+geo[2]:'';
  table.push(row.map(v=>v.slice(0,500)));
 }
 return json({table,updatedAt:new Date().toISOString(),googleBaseAvailable:!!env.ARVORES_GOOGLE_MAPS_KEY});
}
async function base(url,env){
 if(!env.ARVORES_GOOGLE_MAPS_KEY)return json({code:'base_not_configured'},503);
 const values=['lat','lon','z','w','h'].map(k=>url.searchParams.get(k));
 if(values.some(v=>v===null||!/^[-+]?\d{1,3}(?:\.\d{1,8})?$/.test(v)))return json({code:'invalid_view'},400);
 const [lat,lon,z,w,h]=values.map(Number);
 if(Math.abs(lat)>85.051129||Math.abs(lon)>180||![z,w,h].every(Number.isInteger)||z<0||z>21||w<1||w>640||h<1||h>640)return json({code:'invalid_view'},400);
 const api=new URL('https://maps.googleapis.com/maps/api/staticmap');
 for(const [k,v] of Object.entries({center:lat+','+lon,zoom:z,size:w+'x'+h,scale:1,maptype:'roadmap',language:'pt-BR',region:'BR',key:env.ARVORES_GOOGLE_MAPS_KEY}))api.searchParams.set(k,String(v));
 const res=await fetch(api,{redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!res.ok||!res.headers.get('content-type')?.startsWith('image/'))return json({code:'base_unavailable'},502);
 return new Response(res.body,{headers:{...headers,'content-type':res.headers.get('content-type')}});
}
// Public cartographic rectangle for Ipatinga. Inspection coordinates are never sent.
const cartographyBox='-4739983.918,-2216017.978,-4732080.234,-2209641.303';
const cartographyProviders=[['esri-topo','World_Topo_Map'],['esri-imagery','World_Imagery']];
async function cartography(){
 const providers=[];
 for(const [source,service] of cartographyProviders){
  const url=new URL('https://server.arcgisonline.com/ArcGIS/rest/services/'+service+'/MapServer/export');
  for(const [k,v] of Object.entries({bbox:cartographyBox,bboxSR:'3857',imageSR:'3857',size:'2000,1614',format:'jpg',f:'image'}))url.searchParams.set(k,v);
  try{
   const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(6500)});
   const type=res.headers.get('content-type')?.split(';')[0];
   if(!res.ok||!['image/jpeg','image/png'].includes(type)){
    await res.body?.cancel();providers.push({source,status:res.status});continue;
   }
   const data=await res.arrayBuffer();
   if(data.byteLength<1500||data.byteLength>4000000){providers.push({source,status:'invalid'});continue;}
   return new Response(data,{headers:{...headers,'content-type':type,'x-cartographic-source':source}});
  }catch(error){providers.push({source,status:networkStage('map',error).stage});}
 }
 return json({code:'cartography_unavailable',providers},502);
}
export function createWorker(assets,fences){
 return {async fetch(request,env={}){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/mapa/historico'||path==='/api/mapa/base'||path==='/api/mapa/cartografia'||path==='/api/mapa/cercas'){
   if(request.method!=='GET')return json({code:'method'},405);
   const auth=owner(request,env);
   if(auth!==200)return json({code:auth===401?'sign_in':'forbidden',signIn},auth);
   if(path.endsWith('/cercas'))return json(fences);
   if(path.endsWith('/cartografia'))return cartography();
   try{return path.endsWith('historico')?await history(env):await base(url,env);}catch(error){
    if(path.endsWith('historico')){
     const stage=error instanceof HistoryFailure?error.stage:'unexpected';
     const status=error instanceof HistoryFailure&&Number.isInteger(error.status)?error.status:'';
     console.error('arvores_history',stage,status);
     return json({code:'history_unavailable',stage,...(status?{upstreamStatus:status}:{})},502);
    }
    return json({code:'base_unavailable'},502);
   }
  }
  const asset=assets.get(path==='/mapa/'?'/mapa':path);
  if(!asset)return new Response('Página não encontrada',{status:404,headers});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'x-content-type-options':'nosniff','cache-control':'no-cache'}});
 }};
}
