(function(root){
 'use strict';
 const config={"version":3,"formUrl":"https://docs.google.com/forms/d/e/1FAIpQLSezR2ENr3QzisB_LgO_vpvkzccZkY2OtOroTRP3MOhxKwEsHA/viewform","entries":{"treeId":"entry.1459804638","location":"entry.1518557812","species":"entry.899082606","component":"entry.444718194","evaluator":"entry.2100273964","inspectedAt":"entry.476983064","inspectionReason":"entry.34972210","target":"entry.1646280394","targetType":"entry.810703234","scenarioStage":"entry.1164195364","reach":"entry.1889716206","geometry":"entry.782455236","evidence":"entry.918912370","f":"entry.893255723","e":"entry.507383730","c":"entry.147603358"},"dateEntries":{}};
 const choices={
  f:{'1':'F1 — Improvável','2':'F2 — Possível','3':'F3 — Provável','4':'F4 — Iminente'},
  e:{'1':'E1 — Ocasional','2':'E2 — Frequente','3':'E3 — Contínua'},
  c:{'1':'C1 — Baixa','2':'C2 — Média','3':'C3 — Alta','4':'C4 — Crítica'},
  inspectionReason:{rotina:'Rotina','pos-evento':'Após chuva, tempestade ou vento forte',alteracao:'Alteração observada / perda de controle',outro:'Outro'},
  targetType:{pessoas:'Pessoas',fixo:'Instalação / estrutura fixa alcançável',movel:'Veículo / equipamento / bem móvel'},
  scenarioStage:{inicial:'Exposição inicial','apos-controles':'Exposição após os controles'},
  reach:{verificado:'Avaliada e documentada'}
 };
 const dates=typeof module!=='undefined'&&module.exports?require('./dates.js'):root.TreeDates;
 function reviewUrl(item){
  const data={...item.data};
  // Compatibilidade com o receptor legado, sem exigir um segundo preenchimento.
  data.location=data.location||data.target;
  data.inspectedAt=dates.formatDateTime(data.inspectedAt);
  if(data.coordinates)data.geometry=[data.geometry,'Coordenadas da árvore (latitude, longitude): '+data.coordinates].filter(Boolean).join('\n\n');
  if(data.photoLinks)data.evidence=[data.evidence,'Links das fotos da árvore:\n'+data.photoLinks].filter(Boolean).join('\n\n');
  const url=new URL(config.formUrl);url.searchParams.set('usp','pp_url');url.searchParams.set('hl','pt-BR');
  for(const [key,entry] of Object.entries(config.entries)){
   const value=choices[key]?.[data[key]]??data[key];
   if(config.dateEntries?.[key]==='parts'&&value){const [year,month,day]=value.split('-');url.searchParams.set(entry+'_year',year);url.searchParams.set(entry+'_month',String(Number(month)));url.searchParams.set(entry+'_day',String(Number(day)));continue;}
   if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(entry,String(value));
  }
  return url.href;
 }
 const api={reviewUrl,formUrl:config.formUrl,entries:config.entries};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TreeDrive=api;
})(typeof window!=='undefined'?window:globalThis);
