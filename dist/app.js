'use strict';
const form=document.getElementById('assessment');
const $=id=>document.getElementById(id);
const API=window.TreeRisk;
const STORAGE='arvores-avaliacoes-v1';
const DRAFT='arvores-rascunho-v1';
const SOURCE='Norma_Corporativa_Criticidade_Poda_Supressao_Arvores(1).docx — matrizes do item 6';
const fieldNames=Array.from(form.elements).filter(e=>e.name).map(e=>e.name);
let records=[],editingId=null,localEditOnly=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function values(){
 window.TreeDates.syncAll();
 return Object.fromEntries(fieldNames.map(n=>{const el=form.elements[n];return [n,el.type==='checkbox'&&!el.checked?'':el.value.trim()];}));
}
function normalizeCoordinates(value){
 const raw=String(value??'').trim().replace(/−/g,'-');
 const parts=raw.includes(';')?raw.split(';').map(part=>part.trim().replace(',','.')):raw.split(',').map(part=>part.trim());
 if(parts.length!==2||parts.some(part=>!/^[-+]?\d{1,3}(?:\.\d{1,12})?$/.test(part)))return '';
 if(Math.abs(Number(parts[0]))>90||Math.abs(Number(parts[1]))>180)return '';
 return parts.join(', ');
}
function validateCoordinates(show=true){
 const field=form.elements.coordinates;
 if(normalizeCoordinates(field.value))return true;
 if(show)showError('Informe latitude e longitude válidas em graus decimais, como -19.470000, -42.540000.',field);
 return false;
}
const coordinateField=$('treeCoordinates'),captureButton=$('captureCoordinates'),coordinateStatus=$('coordinatesStatus');
let locationRequest=0;
function resetLocationCapture(){
 locationRequest++;
 captureButton.disabled=false;
 coordinateStatus.textContent='';
}
coordinateField.addEventListener('input',resetLocationCapture);
captureButton.addEventListener('click',()=>{
 if(!navigator.geolocation){
  coordinateStatus.textContent='A localização automática não está disponível neste navegador. Informe as coordenadas manualmente.';
  return;
 }
 const request=++locationRequest;
 captureButton.disabled=true;
 coordinateStatus.textContent='Buscando a localização do dispositivo…';
 function finish(message){
  if(request!==locationRequest)return;
  captureButton.disabled=false;
  coordinateStatus.textContent=message;
 }
 function fail(error){
  const message={1:'Permita o acesso à localização nas configurações do navegador e tente novamente.',2:'O dispositivo não conseguiu determinar a localização. Tente novamente.',3:'A captura demorou demais. Tente novamente.'}[error?.code]||'Não foi possível capturar a localização.';
  finish(message+' Se necessário, informe as coordenadas manualmente.');
 }
 try{
  navigator.geolocation.getCurrentPosition(({coords})=>{
   if(request!==locationRequest)return;
   const {latitude,longitude,accuracy}=coords;
   if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){fail();return;}
   coordinateField.value=latitude.toFixed(6)+', '+longitude.toFixed(6);
   coordinateField.dispatchEvent(new Event('input',{bubbles:true}));
   coordinateStatus.textContent=Number.isFinite(accuracy)?'Localização capturada. Precisão estimada: '+Math.max(1,Math.ceil(accuracy))+' m.':'Localização capturada.';
  },fail,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 }catch{fail();}
});
function localNow(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function newId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
function fmtDate(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?s:d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}
function applyValues(data){
 resetLocationCapture();
 if(String(data.target??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR')==='pessoas no restaurante')data={...data,target:'Restaurante, vestiário e vivência'};
 const target=form.elements.target;
 target.querySelector('[data-legacy-target]')?.remove();
 if(data.target&&!Array.from(target.options).some(option=>option.value===data.target)){
  const previous=new Option(data.target,data.target);
  previous.dataset.legacyTarget='';
  target.add(previous);
 }
 for(const n of fieldNames){
  const el=form.elements[n];
  if(el.type==='checkbox')el.checked=data[n]===el.value;else el.value=n==='scenarioStage'?(data[n]||'inicial'):(data[n]??'');
 }
 window.TreeDates.loadAll();
}
const speciesList=$('speciesOptions');
const speciesKey='arvores-especies-v1';
const speciesOptions=new Map();
const cleanSpecies=value=>String(value??'').trim().replace(/\s+/g,' ').normalize('NFC');
const speciesIdentity=value=>cleanSpecies(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
function addSpecies(value){
 const name=cleanSpecies(value),key=speciesIdentity(name);
 if(name&&name.length<=120&&key&&!speciesOptions.has(key))speciesOptions.set(key,name);
 return speciesOptions.get(key)||name;
}
function renderSpecies(){
 speciesList.replaceChildren(new Option('Ver lista',''),...Array.from(speciesOptions.values()).sort((a,b)=>a.localeCompare(b,'pt-BR')).map(name=>new Option(name==='Resedá/rezendá'?name+', mediante confirmação botânica':name,name)));
}
function loadSpecies(){
 for(const option of speciesList.options)if(option.value)addSpecies(option.value);
 try{const stored=JSON.parse(localStorage.getItem(speciesKey)||'[]');if(Array.isArray(stored))for(const name of stored)if(typeof name==='string')addSpecies(name);}catch{}
 for(const record of records)addSpecies(record.data.species);
 renderSpecies();
}
function rememberSpecies(value){
 if(!value)return;
 addSpecies(value);renderSpecies();
 try{localStorage.setItem(speciesKey,JSON.stringify([...speciesOptions.values()]));}catch{}
}
const fHelp={
 '1':'F1 — Inspeção suficiente, sem mecanismo plausível de falha identificado no período avaliado.',
 '2':'F2 — Mecanismo plausível e condição predisponente, sem evidências para F3 ou F4.',
 '3':'F3 — As evidências e a avaliação técnica sustentam falha provável no período avaliado.',
 '4':'F4 — Falha iminente: fissura abrindo, deslocamento novo da base ou ruptura em progressão.'
};
const eHelp={
 '1':'E1 — Presença esporádica no alcance da queda, sem exclusão completa. Identifique quem acessa, horários e condições.',
 '2':'E2 — Circulação ou ocupação recorrente por turnos, ciclos ou períodos de uso. Verifique picos e acessos não programados.',
 '3':'E3 — Alvo fixo ou presença contínua, sem afastamento eficaz do alcance. A ausência de pessoas não elimina uma instalação alcançável.'
};
const cHelp={
 '1':'C1 — Consequência baixa: dano limitado e sem função crítica. Justifique por que não são plausíveis consequências C3 ou C4.',
 '2':'C2 — Consequência média: danos locais demonstrados. Justifique por que não são plausíveis consequências C3 ou C4.',
 '3':'C3 — Consequência alta: lesão grave ou fatalidade individual plausível, danos ou interrupção relevantes, conforme o cenário.',
 '4':'C4 — Consequência crítica: múltiplas vítimas, liberação perigosa ou efeitos ampliados plausíveis, como incêndio, explosão ou perda de função essencial.'
};
function immediateAlert(r){return r.immediate?'<div class="alert"><strong>F4 · Proteção imediata</strong>Exige proteção e afastamento imediatos, independentemente do R calculado. Acione os responsáveis e mantenha a área protegida.</div>':'';}
let currentStep=0;
function showStep(index,focus=true){
 currentStep=Number(index);
 document.querySelectorAll('[data-page]').forEach(p=>p.classList.toggle('hidden',Number(p.dataset.page)!==currentStep));
 document.querySelectorAll('[data-step]').forEach(b=>{if(Number(b.dataset.step)===currentStep)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 if(focus){$('title'+currentStep).focus({preventScroll:true});form.scrollIntoView({behavior:'smooth',block:'start'});}
}
function revealField(el){
 const page=el.closest('[data-page]');if(page)showStep(page.dataset.page,false);
 let parent=el.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
}
function updateResult(){
 const v=values(),r=API.evaluate(v);
 $('fHelp').textContent=fHelp[v.f]||'Condição da árvore no período avaliado.';
 $('eHelp').textContent=eHelp[v.e]||'Presença e permanência do alvo no alcance da queda.';
 $('cHelp').textContent=cHelp[v.c]||'Maior consequência plausível no local.';
 $('fixedNote').classList.toggle('hidden',v.targetType!=='fixo');
 for(const o of form.elements.e.options)o.disabled=v.targetType==='fixo' && o.value!=='3' && o.value!=='';
 $('stormNote').classList.toggle('hidden',v.inspectionReason!=='pos-evento');
 let title='Aguardando critérios',sub='Selecione F, E e C e confirme o alcance.',body='<p>O resultado aparece automaticamente. Os dados de identificação podem ser preenchidos na próxima etapa.</p>',color='';
 if(r.status==='ok'){
  title=`R${r.r} · ${r.name}`;sub='Criticidade do risco de queda';color=`r${r.r}`;
  body=`<div class="risk-scale" aria-label="Escala de criticidade">${[1,2,3,4].map(n=>`<span class="r${n} ${n===r.r?'selected':''}" ${n===r.r?'aria-current="true"':''}>R${n}<small>${API.names[n]}</small></span>`).join('')}</div><div class="equation"><span>F${esc(v.f)} + E${esc(v.e)} → J${r.j}</span><span>J${r.j} + C${esc(v.c)} → R${r.r}</span></div><h3>Diretriz de proteção</h3><p>${esc(r.action)}</p>`;

 }else if(r.status==='invalid'){
  title='Verifique os critérios';sub='Cálculo ainda não concluído';body=`<p>${esc(r.reason)}</p>`;
 }
 $('result').innerHTML=`<div class="result-top ${color}"><p class="eyebrow">RESULTADO AUTOMÁTICO</p><h2>${title}</h2><p>${sub}</p></div><div class="result-body">${immediateAlert(r)}${body}<p class="small">${r.status==='ok'?'Resultado calculado. Complete a identificação na etapa 2 para registrar.':'Campos vazios não recebem uma classe de risco.'}</p></div>`;
 $('viewResult').disabled=r.status!=='ok';
 $('expandedResult').innerHTML=$('result').innerHTML;
 const summary=[v.treeId,v.species,v.target].filter(Boolean).map(esc).join(' · ');
 $('reviewSummary').innerHTML=`<strong>Conferência da avaliação</strong><p>${summary||'Complete os dados de identificação.'}</p>${r.status==='ok'?`<span class="risk-tag r${r.r}">R${r.r} · ${r.name}</span> <span class="small">F${esc(v.f)} / E${esc(v.e)} / C${esc(v.c)}</span>`:'<p>Classificação pendente.</p>'}${r.immediate?'<p class="small"><strong>F4: proteção e afastamento imediatos.</strong></p>':''}`;
 renderMatrices(v,r);
 return r;
}
function renderMatrices(v,r){
 const j='<table aria-label="Matriz F por E"><thead><tr><th>F / E</th>'+[1,2,3].map(x=>`<th>E${x}</th>`).join('')+'</tr></thead><tbody>'+API.J.map((row,i)=>`<tr><th>F${i+1}</th>${row.slice(1).map((x,index)=>{const k=index+1;return `<td class="${v.f===String(i+1)&&v.e===String(k)?'jactive':''}">J${x}${i===3?'*':''}</td>`;}).join('')}</tr>`).join('')+'</tbody></table>';
 const m='<table aria-label="Matriz J por C"><thead><tr><th>J / C</th>'+[1,2,3,4].map(x=>`<th>C${x}</th>`).join('')+'</tr></thead><tbody>'+API.R.map((row,i)=>`<tr><th>J${i+1}</th>${row.map((x,k)=>`<td class="r${x} ${r.j===i+1&&v.c===String(k+1)?'active':''}">R${x}</td>`).join('')}</tr>`).join('')+'</tbody></table>';
 $('matrixJ').innerHTML=j;$('matrixR').innerHTML=m;
}
function saveDraft(){try{localStorage.setItem(DRAFT,JSON.stringify({data:values(),editingId,localEditOnly}));$('draftStatus').textContent='Rascunho salvo automaticamente neste navegador.';}catch{$('draftStatus').textContent='Não foi possível salvar o rascunho neste navegador. Verifique o espaço e as permissões de armazenamento.';}}
function showError(message,el){$('formError').textContent=message;$('formError').classList.remove('hidden');if(el){revealField(el);el.setAttribute('aria-invalid','true');el.focus();el.scrollIntoView({block:'center',behavior:'smooth'});}}
function validate(show=true){
 const v=values();for(const e of form.elements)e.removeAttribute?.('aria-invalid');
 const bad=Array.from(form.elements).find(e=>e.willValidate && (!e.checkValidity() || (e.required&&!e.value.trim())));
 if(bad){if(show)showError('Preencha o campo obrigatório indicado para registrar a avaliação.',bad);return false;}
 if(!validateCoordinates(show))return false;
 if(v.photoLinks&&!v.photoLinks.split(/\r?\n/).filter(line=>line.trim()).every(line=>{
  try{const url=new URL(line.trim());return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
 })){if(show)showError('Informe um link HTTPS válido por linha para as fotos.',form.elements.photoLinks);return false;}
 if(!['1','2','3'].includes(v.e)||API.evaluate(v).status!=='ok'){if(show)showError('Complete e verifique os critérios da avaliação antes de registrar.');return false;}
 $('formError').classList.add('hidden');return true;
}
function persistRecords(next){try{localStorage.setItem(STORAGE,JSON.stringify(next));records=next;return true;}catch{$('recordStatus').textContent='Não foi possível salvar os registros. Verifique o espaço e as permissões de armazenamento do navegador.';return false;}}
function renderRecords(){
 $('recordCount').textContent=records.length;$('localCount').textContent=records.length;
 $('print').disabled=!records.length;
 if(!records.length){$('records').innerHTML='<div class="empty">Nenhuma cópia local. Preencha a avaliação e use os botões de salvamento ou envio ao Drive.</div>';return;}
 $('records').innerHTML='<div class="table-scroll"><table><thead><tr><th>Árvore / local</th><th>Componente / controles</th><th>F · E · C → J</th><th>Criticidade</th><th>Registro</th></tr></thead><tbody>'+records.map(item=>{
  const d=item.data,r=API.evaluate(d);
  return `<tr><td><strong>${esc(d.treeId)}</strong><small>${esc(d.target)}</small></td><td>${esc(d.component)}<small>${d.scenarioStage==='apos-controles'?'Após controles':'Inicial'}</small></td><td>F${esc(d.f)} · E${esc(d.e)} · C${esc(d.c)} → J${r.j}${r.immediate?'*':''}</td><td><span class="risk-tag r${r.r}">R${r.r} · ${r.name}</span>${r.immediate?'<small><strong>F4: proteção imediata</strong></small>':''}</td><td><small>${esc(fmtDate(d.inspectedAt))}</small><button class="secondary" type="button" data-edit="${esc(item.id)}">Editar</button><button class="secondary" type="button" data-delete="${esc(item.id)}">Excluir</button></td></tr>`;
 }).join('')+'</tbody></table></div>';
}
form.addEventListener('input',event=>{const el=event.target;if(el.checkValidity?.()&&(!el.required||el.value.trim()))el.removeAttribute('aria-invalid');if(!form.querySelector('[aria-invalid="true"]'))$('formError').classList.add('hidden');updateResult();saveDraft();});
speciesList.addEventListener('change',()=>{
 if(speciesList.value){form.elements.species.value=speciesList.value;speciesList.value='';}
});
form.addEventListener('change',event=>{
 if(event.target.name==='targetType' && event.target.value==='fixo')form.elements.e.value='3';
 updateResult();saveDraft();
});
let saving=false;
function updateSaveMode(){
 const save=$('saveButton');
 save.textContent=localEditOnly?'Salvar alterações':editingId?'Atualizar neste navegador':'Salvar neste navegador';
 save.classList.toggle('primary',localEditOnly);
 save.classList.toggle('secondary',!localEditOnly);
 for(const id of ['sendDrive','sendDriveHint'])$(id).hidden=localEditOnly;
 $('localEditHint').hidden=!localEditOnly;
 if(localEditOnly)$('driveStatus').textContent='';
}
async function registerScenario(scroll=true){
 if(saving||!validate())return null;
 const data={...(records.find(x=>x.id===editingId)?.data||{}),...values()};
 data.coordinates=normalizeCoordinates(data.coordinates);
 data.species=speciesOptions.get(speciesIdentity(data.species))||cleanSpecies(data.species);
 const item={id:editingId||newId(),data,updatedAt:new Date().toISOString()};
 const photoField=$('treePhotos').closest('fieldset');
 saving=true;photoField.disabled=true;
 try{await window.TreePhotos.save(item.id);}
 catch{photoField.disabled=false;showError('Não foi possível salvar as fotos neste navegador. Verifique o espaço disponível ou remova os arquivos para prosseguir.', $('treePhotos'));return null;}
 finally{saving=false;photoField.disabled=false;}
 const next=editingId?records.map(x=>x.id===editingId?item:x):[...records,item];
 if(persistRecords(next)){try{localStorage.setItem('arvores-avaliador',data.evaluator);}catch{}form.elements.species.value=data.species;rememberSpecies(data.species);editingId=item.id;updateSaveMode();renderRecords();saveDraft();$('recordStatus').textContent=localEditOnly?`Alterações de ${item.data.treeId} salvas nesta cópia, sem novo envio.`:`Cópia local da árvore ${item.data.treeId} salva. Para o histórico central, confirme o envio no Google Forms.`;if(scroll){$('recordStatus').closest('details').open=true;$('recordStatus').scrollIntoView({behavior:'smooth',block:'center'});}return item;}
 return null;
}
form.addEventListener('submit',event=>{event.preventDefault();registerScenario();});
$('sendDrive').addEventListener('click',async()=>{
 if(localEditOnly)return;
 const item=await registerScenario(false);if(!item)return;
 const url=window.TreeDrive.reviewUrl(item);
 $('driveStatus').innerHTML=`<strong>Confirmação no Google Forms:</strong> confira os dados e clique em Enviar para registrar no Drive. <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir novamente o formulário preenchido</a>.`;
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click();
});
$('newButton').addEventListener('click',()=>{
 if(saving)return;
 window.TreePhotos.load(null);
 const v=values(),keep={};for(const n of ['treeId','coordinates','species','component','evaluator'])keep[n]=v[n];
 form.reset();applyValues(keep);form.elements.inspectedAt.value=localNow();window.TreeDates.loadAll();form.elements.inspectionReason.value='rotina';form.elements.scenarioStage.value='inicial';editingId=null;localEditOnly=false;updateSaveMode();$('driveStatus').textContent='';$('formError').classList.add('hidden');for(const e of form.elements)e.removeAttribute?.('aria-invalid');updateResult();saveDraft();showStep(0);form.elements.target.focus();
});
$('records').addEventListener('click',event=>{
 if(saving)return;
 const edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
 if(edit){const item=records.find(x=>x.id===edit.dataset.edit);if(!item)return;editingId=item.id;localEditOnly=true;applyValues(item.data);window.TreePhotos.load(item.id);updateSaveMode();$('formError').classList.add('hidden');updateResult();saveDraft();showStep(0);}
 if(del){const item=records.find(x=>x.id===del.dataset.delete);if(!item||!confirm(`Excluir o cenário de ${item.data.treeId} para ${item.data.target}? A exclusão afeta somente a cópia neste navegador.`))return;if(persistRecords(records.filter(x=>x.id!==item.id))){if(editingId===item.id){editingId=null;localEditOnly=false;updateSaveMode();saveDraft();}renderRecords();$('recordStatus').textContent='Cenário excluído.';}}
});
const labels={treeId:'ID da árvore',location:'Localização',coordinates:'Coordenadas geográficas da árvore',species:'Espécie',photoLinks:'Links das fotos',component:'Componente',evaluator:'Avaliador / função',inspectedAt:'Data e hora da inspeção',horizon:'Horizonte',inspectionReason:'Motivo da inspeção',target:'Alvo',targetType:'Tipo de alvo',scenarioStage:'Situação dos controles',reach:'Alcance verificado',geometry:'Geometria, alcance e ocupação',evidence:'Evidências / checklist / fotos / croqui',f:'F',fReason:'Justificativa de F',e:'E',eReason:'Justificativa de E',exclusionEvidence:'Comprovação de E0',controlOwner:'Responsável por E0',controlValidity:'Validade de E0',c:'C',cReason:'Justificativa de C',measures:'Medidas / encaminhamento',actionOwner:'Responsável pelas medidas',followUp:'Prazo / próxima inspeção',notes:'Limitações / observações'};
const display={inspectionReason:{rotina:'Rotina','pos-evento':'Após chuva, tempestade ou vento forte',alteracao:'Alteração observada / perda de controle',outro:'Outro'},targetType:{pessoas:'Pessoas',fixo:'Instalação / estrutura fixa alcançável',movel:'Veículo / equipamento / bem móvel',ausente:'Alvo ausente / retirado no período'},scenarioStage:{inicial:'Exposição inicial','apos-controles':'Exposição após os controles'},reach:{verificado:'Avaliada e documentada'}};
function displayValue(k,v){if(k==='followUp')return window.TreeDates.formatDate(v);if(['inspectedAt','controlValidity'].includes(k))return fmtDate(v);return display[k]?.[v]??v;}
function validateRecord(item){
 if(!item || typeof item.id!=='string' || item.id.length>200 || !item.data || typeof item.data!=='object')return false;
 const d=item.data;
 if(fieldNames.some(n=>(!['photoLinks','coordinates'].includes(n)||d[n]!==undefined)&&(typeof d[n]!=='string'||d[n].length>12000)))return false;
 const required=['treeId','component','evaluator','inspectedAt','inspectionReason','target','targetType','scenarioStage','reach','geometry','evidence','f','e','c'];
 if(required.some(n=>!d[n].trim()))return false;
 if(!display.targetType[d.targetType]||!display.scenarioStage[d.scenarioStage]||!display.inspectionReason[d.inspectionReason]||d.reach!=='verificado')return false;
 if(isNaN(new Date(d.inspectedAt))||API.evaluate(d).status!=='ok')return false;
 if(d.e==='0'&&(isNaN(new Date(d.controlValidity))||d.controlValidity<d.inspectedAt))return false;
 return true;
}
$('print').addEventListener('click',()=>{
 const generated=fmtDate(new Date().toISOString());
 $('printArea').innerHTML=records.map((item,i)=>{
  const d=item.data,r=API.evaluate(d);
  const fields=fieldNames;
  return `<article class="report"><p class="eyebrow">AVALIAÇÃO DE CRITICIDADE DE ÁRVORES</p><h1>${esc(d.treeId)} · ${esc(d.target)}</h1><p class="report-meta">Cenário ${i+1} de ${records.length} · Registro ${esc(item.id)} · Emitido em ${esc(generated)}</p><div class="report-result r${r.r}"><strong>R${r.r} · ${r.name}</strong><p>F${esc(d.f)} + E${esc(d.e)} → J${r.j}${r.immediate?'*':''}; J${r.j} + C${esc(d.c)} → R${r.r}</p>${r.immediate?'<p><b>F4: proteção e afastamento imediatos, independentemente do R calculado.</b></p>':''}<p>${esc(r.action)}</p></div><dl>${fields.map(n=>`<dt>${esc(labels[n]||n)}</dt><dd>${esc(displayValue(n,d[n])||'—')}</dd>`).join('')}</dl><p class="report-meta">${esc(SOURCE)}. O resultado é qualitativo e não autoriza poda, supressão ou reabertura da área. Registro da avaliação; a definição das classes cabe ao avaliador.</p></article>`;
 }).join('');window.print();
});

document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>showStep(b.dataset.step)));
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>{
 const next=Number(b.dataset.next);
 if(next>currentStep){
  const page=document.querySelector(`[data-page="${currentStep}"]`);
  const bad=Array.from(page.querySelectorAll('input,select,textarea')).find(el=>el.willValidate&&(!el.checkValidity()||(el.required&&!el.value.trim())));
  if(bad){showError('Preencha o campo obrigatório indicado para continuar.',bad);return;}
  if(currentStep===0&&!validateCoordinates())return;
  if(currentStep===0&&API.evaluate(values()).status!=='ok'){showError('Conclua a classificação para continuar.');return;}
 }
 $('formError').classList.add('hidden');showStep(next);
}));
$('viewResult').addEventListener('click',()=>{$('expandedResult').innerHTML=$('result').innerHTML;$('resultDialog').showModal();});
$('closeResult').addEventListener('click',()=>$('resultDialog').close());
$('resultDialog').addEventListener('click',e=>{if(e.target===$('resultDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

function init(){
 form.elements.inspectedAt.value=localNow();window.TreeDates.loadAll();
 try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(!Array.isArray(saved)||!saved.every(validateRecord))throw new Error();records=saved;}catch{$('recordStatus').textContent='Há dados locais que não puderam ser carregados neste navegador.';}
 try{const draft=JSON.parse(localStorage.getItem(DRAFT)||'null');if(draft?.data){applyValues(draft.data);editingId=records.some(x=>x.id===draft.editingId)?draft.editingId:null;localEditOnly=Boolean(editingId&&draft.localEditOnly);}}catch{$('draftStatus').textContent='O rascunho anterior não pôde ser recuperado.';}
 loadSpecies();if(editingId)window.TreePhotos.load(editingId);
 try{if(!form.elements.evaluator.value)form.elements.evaluator.value=localStorage.getItem('arvores-avaliador')||'';}catch{}
 const fromMap=new URLSearchParams(location.search).get('arvore');
 if(fromMap&&!editingId){form.elements.treeId.value=fromMap.slice(0,100);}
 updateSaveMode();updateResult();renderRecords();
 if(!form.elements.coordinates.value&&navigator.geolocation)captureButton.click();
}
init();
if(location.hash==='#identificar')showStep(1,false);
