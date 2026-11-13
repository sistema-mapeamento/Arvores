// Instalar como arquivo separado no projeto existente. O receptor de inspeções permanece intacto.
function doPost(e) {
 const answer = payload => ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
 try {
  if (!e || !e.postData || e.postData.contents.length > 900) return answer({ok:false});
  const request = JSON.parse(e.postData.contents);
  if (!Number.isSafeInteger(request.ts) || Math.abs(Date.now() - request.ts) > 60000 ||
      !/^[0-9a-f-]{36}$/.test(request.nonce || '') || !/^[0-9a-f]{512}$/.test(request.sig || '')) return answer({ok:false});
  if (!mapaValidarAssinatura_(request)) return answer({ok:false});
  const sheet = SpreadsheetApp.openById(PLANILHA_ARVORES).getSheetByName('Historico');
  const size = sheet.getLastRow();
  if (size > 20001) return answer({ok:false,reason:'history_limit'});
  const rows = sheet.getRange(1,1,Math.max(size,1),26).getDisplayValues();
  const columns = [4,5,6,7,8,9,10,12,16,25];
  const headers = ['ID da árvore','Unidade / setor / localização','Espécie','Componente avaliado','Local / alvo exposto','Tipo de alvo','Situação dos controles','Data e hora da inspeção','Geometria, alcance e ocupação','R registrado'];
  if (columns.some((c,i)=>rows[0][c]!==headers[i])) return answer({ok:false,reason:'history_schema'});
  const table = [headers];
  rows.slice(1).forEach(row=>{
   if (!row[4].trim()) return;
   const data=columns.map(c=>row[c].slice(0,500));
   const geo=row[16].match(/Coordenadas da árvore \(latitude, longitude\):\s*([+−-]?\d{1,3}(?:[.,]\d{1,12})?)\s*(?:;\s*|,\s+)([+−-]?\d{1,3}(?:[.,]\d{1,12})?)/i);
   data[8]=geo?'Coordenadas da árvore (latitude, longitude): '+geo[1]+'; '+geo[2]:'';
   table.push(data);
  });
  return answer({ok:true,table});
 } catch (_) {
  return answer({ok:false,reason:'history_unavailable'});
 }
}


// Chave pública do assinante. A chave privada fica exclusivamente no servidor do Site.
const MAPA_ARVORES_RSA_N = '850109c69928ea81a591e8e4fd2d3e922b43968f7279b4741014d325d75fe8f5773770206b4ff96d40083d2b3a031cb4fb837623ef17b6bf853e195952da827bfec6ba67e2c4bf1505a0d5885c0a5afc8c4526e1c85d2fb84dc470936f14d728ea7525a9b85383efdf6eedc9b338d717dc71d7a20cece2440b5785ce763492b54ae664876afe15c41a9a2e34a6899b12a4fd573d8058988c887477c2906447590fa5033acd50e4d90472b3c408bb650573c7f72a6ce360a807643c23efbcde4b83d9118426ea39e6bb7b1a5ce8654fe73cadcd5ccaf4a4af39dfbf3c56ce78ebb0c8342a85d78555cc70ed296c063a41b6dac32878653531c5385eeb1f2432dd';

function mapaValidarAssinatura_(request) {
 const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
  'mapa-arvores-v2:' + request.ts + ':' + request.nonce,Utilities.Charset.UTF_8)
  .map(n => ('0' + (n & 255).toString(16)).slice(-2)).join('');
 const info='3031300d060960864801650304020105000420'+digest;
 const expected='0001'+'ff'.repeat(256-3-info.length/2)+'00'+info;
 const modulus=mapaPalavras_(MAPA_ARVORES_RSA_N), signature=mapaPalavras_(request.sig);
 if(mapaComparar_(signature,modulus)>=0)return false;
 let result=signature;
 for(let i=0;i<16;i++) result=mapaMultiplicar_(result,result,modulus);
 result=mapaMultiplicar_(result,signature,modulus);
 return result.slice().reverse().map(n=>('0000'+n.toString(16)).slice(-4)).join('')===expected;
}

function mapaPalavras_(hex) {
 const out=[];
 for(let i=hex.length;i>0;i-=4)out.push(parseInt(hex.slice(i-4,i),16));
 return out;
}

function mapaComparar_(a,b) {
 for(let i=a.length-1;i>=0;i--)if(a[i]!==b[i])return a[i]>b[i]?1:-1;
 return 0;
}

function mapaSomarModulo_(a,b,modulus) {
 let carry=0;
 for(let i=0;i<a.length;i++){const sum=a[i]+b[i]+carry;a[i]=sum&65535;carry=sum>>>16;}
 if(carry||mapaComparar_(a,modulus)>=0){
  let borrow=0;
  for(let i=0;i<a.length;i++){const diff=a[i]-modulus[i]-borrow;a[i]=diff&65535;borrow=diff<0?1:0;}
 }
}

function mapaMultiplicar_(a,b,modulus) {
 const out=Array(a.length).fill(0);
 for(let i=b.length-1;i>=0;i--)for(let bit=15;bit>=0;bit--){
  mapaSomarModulo_(out,out,modulus);
  if(b[i]&(1<<bit))mapaSomarModulo_(out,a,modulus);
 }
 return out;
}
