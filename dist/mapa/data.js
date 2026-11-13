(function(root){
'use strict';
const targets=['Áreas abertas e vegetadas','Restaurante, vestiário e vivência','Escritório e posto de trabalho','Vias e estacionamentos','Ferrovia e área de manobra','Rede elétrica e subestação','Gases, combustíveis e utilidades','Correias, pontes rolantes e processo','Hidrantes e sistemas ambientais'];
const key=v=>String(v??'').normalize('NFD').replace(/\p{M}/gu,'').trim().replace(/\s+/g,' ').toLowerCase();
const standard=new Map(targets.map(t=>[key(t),t]));
standard.set('pessoas no restaurante',targets[1]);
function category(v){return standard.get(key(v))||'Outros registros anteriores';}
function csv(text){
 text=text.replace(/^\ufeff/,'');
 const first=text.split(/\r?\n/,1)[0];
 const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],field='',quote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quote=false;}else field+=c;}
  else if(c==='"'&&!field)quote=true;
  else if(c===sep){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quote)throw Error('O CSV tem aspas abertas. Exporte novamente a aba Historico.');
 if(field||row.length){row.push(field);rows.push(row);}
 return rows;
}
function date(v){
 const m=String(v??'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 const n=String(v??'').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 const a=m?[m[3],m[2],m[1],m[4],m[5],m[6]]:n?.slice(1);
 if(!a)return '';
 const [y,mo,d,h,min,s]=a.map(x=>Number(x||0));
 const check=new Date(Date.UTC(y,mo-1,d,h,min,s));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||h>23||min>59||s>59)return '';
 return check.toISOString().slice(0,19);
}
function coordinates(v){
 const m=String(v??'').match(/Coordenadas da árvore \(latitude, longitude\):\s*([+−-]?\d+(?:[.,]\d+)?)\s*(?:;\s*|,\s+)([+−-]?\d+(?:[.,]\d+)?)/i);
 if(!m)return null;
 const [lat,lon]=m.slice(1).map(x=>Number(x.replace('−','-').replace(',','.')));
 return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
}
function read(text){return readTable(csv(text));}
function readTable(table){
 const [head,...rows]=table;
 if(!head)throw Error('O arquivo está vazio.');
 const cols=head.map(key), at=(row,name)=>String(row[cols.indexOf(key(name))]??'').trim();
 for(const required of ['ID da árvore','Local / alvo exposto','Geometria, alcance e ocupação','R registrado','Data e hora da inspeção']){
  if(!cols.includes(key(required)))throw Error('Coluna ausente: '+required+'. Importe o CSV da aba Historico.');
 }
 if(rows.length>20000)throw Error('O arquivo tem mais de 20 mil linhas. Exporte um período menor.');
 return rows.flatMap((row,index)=>{
  const id=at(row,'ID da árvore');if(!id)return [];
  const get=n=>at(row,n);
  const local=get('Unidade / setor / localização'),target=get('Local / alvo exposto');
  const component=get('Componente avaliado'),type=get('Tipo de alvo'),stage=get('Situação dos controles');
  const risk=/^R([1-4])$/i.exec(get('R registrado'));
  const geo=coordinates(get('Geometria, alcance e ocupação'));
  const inspected=get('Data e hora da inspeção');
  const stamp=date(inspected),received=date(get('Recebido em')||get('Data e hora do recebimento')||get('Data/hora do recebimento'));
  const tree=JSON.stringify([key(local),key(id)]);
  const targetGroup=category(target);
  const scenario=JSON.stringify([tree,key(component),standard.has(key(target))?key(targetGroup):key(target),key(type),key(stage)]);
  return [{id,local,target,category:targetGroup,component,type,stage,risk:risk?Number(risk[1]):0,geo,inspected,stamp,received,tree,scenario,index,species:get('Espécie'),insp:get('Código'),photos:get('Fotos').split(/[;\n]/).map(x=>x.trim()).filter(x=>/^(exemplo\/fotos\/[\w-]+\.jpg|https:\/\/[^\s"'<>]+)$/.test(x)).slice(0,10),test:/^teste(?:\b|_)/i.test(id)}];
 });
}
function compare(a,b){return (a.stamp||a.received).localeCompare(b.stamp||b.received)||a.received.localeCompare(b.received)||a.index-b.index;}
function views(rows,filters){
 const scoped=rows.filter(d=>(filters.tests||!d.test)&&(!filters.target||d.category===filters.target)&&(!filters.local||d.local===filters.local)&&(!filters.start||d.stamp&&d.stamp.slice(0,10)>=filters.start)&&(!filters.end||d.stamp&&d.stamp.slice(0,10)<=filters.end));
 const latest=new Map();
 for(const row of scoped){const previous=latest.get(row.scenario);if(!previous||compare(row,previous)>0)latest.set(row.scenario,row);}
 const scenarios=(filters.history?scoped:[...latest.values()]).filter(d=>filters.risks.includes(d.risk));
 const visible=scenarios.filter(d=>d.geo);
 const groups=new Map();
 for(const row of visible){if(!groups.has(row.tree))groups.set(row.tree,[]);groups.get(row.tree).push(row);}
 const points=[...groups.values()].map(rows=>{rows.sort((a,b)=>b.risk-a.risk||compare(b,a));return {...rows[0],rows};});
 return {scoped,scenarios,visible,points,missing:scoped.filter(d=>!d.geo),unclassified:scoped.filter(d=>!d.risk)};
}
function streets(text){
 const obj=JSON.parse(text);
 if(obj.type!=='FeatureCollection'||!Array.isArray(obj.features))throw Error('Selecione um GeoJSON do tipo FeatureCollection.');
 const out=[];
 for(const feature of obj.features){
  const name=String(feature.properties?.name||feature.properties?.nome||'').trim().slice(0,100), g=feature.geometry;
  if(!name||!g)continue;
  const paths=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
  for(const line of paths){if(!Array.isArray(line))continue;
   const valid=line.length>=2&&line.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
   if(valid)out.push({name,points:line.map(([lon,lat])=>({lat,lon}))});
  }
 }
 if(!out.length)throw Error('O GeoJSON não contém linhas de ruas nomeadas e coordenadas válidas.');
 if(out.length>4000||out.reduce((sum,p)=>sum+p.points.length,0)>150000)throw Error('A camada excede o limite. Use somente as ruas da área de interesse.');
 return out;
}
const api={targets,read,readTable,views,streets,coordinates,csv};
if(typeof module==='object')module.exports=api;else root.TreeMapData=api;
})(typeof window==='undefined'?globalThis:window);
