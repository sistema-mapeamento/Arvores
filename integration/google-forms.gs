/** Integração da planilha de inspeções com Google Forms. Sem envio de e-mails ou acesso a serviços externos. */
const PLANILHA_ARVORES = '198DHEgxvkQitEH6tACaQ8EmvsV2NAkI6KfNyfWu-4mk';
const VERSAO_ARVORES = '2.2';
const CAMPOS_ARVORES = [
 ['treeId','ID da árvore',true],
 ['location','Unidade / setor / localização',true],
 ['species','Espécie, se conhecida',false],
 ['component','Componente avaliado',true,['Árvore inteira','Tronco','Galho / forquilha','Parte da copa','Folha / cacho de palmeira','Outro componente','Raiz']],
 ['evaluator','Avaliador / função',true],
 ['inspectedAt','Data e hora da inspeção',true,null,'Use DD/MM/AAAA HH:MM (24 horas). Exemplo: 22/10/2026 08:30.'],
 ['inspectionReason','Motivo da inspeção',true,['Rotina','Após chuva, tempestade ou vento forte','Alteração observada / perda de controle','Outro']],
 ['target','Local / alvo exposto',true],
 ['targetType','Tipo de alvo',true,['Pessoas','Instalação / estrutura fixa alcançável','Veículo / equipamento / bem móvel']],
 ['scenarioStage','Situação dos controles',true,['Exposição inicial','Exposição após os controles']],
 ['reach','Verificação de alcance e distâncias',true,['Avaliada e documentada']],
 ['geometry','Geometria, alcance e ocupação',true,null,'Informe dimensões, distâncias, método de avaliação, turnos e acessos.',true],
 ['evidence','Evidências / referência ao checklist, fotos e croqui',true,null,'Descreva a condição observada e as referências aos arquivos.',true],
 ['f','F — Possibilidade de falha',true,['F1 — Improvável','F2 — Possível','F3 — Provável','F4 — Iminente'],'F1: inspeção suficiente, sem mecanismo plausível identificado. F2: mecanismo plausível e condição predisponente. F3: evidências de falha provável. F4: fissura abrindo, deslocamento novo da base ou ruptura em progressão; exige proteção e afastamento imediatos.'],
 ['e','E — Exposição do alvo',true,['E1 — Ocasional','E2 — Frequente','E3 — Contínua'],'Alvo fixo alcançável permanece E3. Avalie a frequência e a permanência do alvo.'],
 ['c','C — Consequência no local',true,['C1 — Baixa','C2 — Média','C3 — Alta','C4 — Crítica'],'Utilize a maior consequência plausível no cenário. Não faça médias entre pessoas, patrimônio, processo e meio ambiente.'],
];
function onOpen() {
 SpreadsheetApp.getUi().createMenu('Inspeções de árvores')
  .addItem('Configurar formulário receptor','configurarFormularioArvores')
  .addItem('Recuperar envios pendentes','recuperarEnviosArvores')
  .addToUi();
}
function configurarFormularioArvores() {
 const book=SpreadsheetApp.openById(PLANILHA_ARVORES),props=PropertiesService.getScriptProperties();
 const priorId=props.getProperty('FORMULARIO_ARVORES');
 let id=props.getProperty('FORMULARIO_ARVORES_REVISAO22');
 let form=id?FormApp.openById(id):null;
 if(!form){form=FormApp.create('Inspeção de árvores — avaliação de criticidade',false);id=form.getId();props.setProperty('FORMULARIO_ARVORES_REVISAO22',id);}
 form.setDescription('Confirme os dados recebidos do formulário web e clique em Enviar para registrar a inspeção no histórico. A criticidade R é calculada pelas matrizes do procedimento. F4 exige proteção e afastamento imediatos, qualquer que seja R.');
 form.setCollectEmail(false).setLimitOneResponsePerUser(false).setAllowResponseEdits(false).setPublishingSummary(false).setProgressBar(true);
 form.setConfirmationMessage('Inspeção recebida. A criticidade R será processada na planilha de histórico. Em F4, mantenha proteção e afastamento imediatos, independentemente de R.');
 const map={},dateEntries={};
 for(const field of CAMPOS_ARVORES){
  let item=form.getItems().find(x=>x.getTitle()===field[1])||form.getItems().find(x=>x.getTitle()==='');
  if(!item)item=field[5]==='date'?form.addDateItem().setIncludesYear(true):field[3]?form.addMultipleChoiceItem():field[5]?form.addParagraphTextItem():form.addTextItem();
  item=form.getItemById(item.getId());
  const typed=field[5]==='date'?item.asDateItem():field[3]?item.asMultipleChoiceItem():field[5]?item.asParagraphTextItem():item.asTextItem();
  if(field[3])typed.setChoiceValues(field[3]);
  typed.setTitle(field[1]).setRequired(field[2]);if(field[4])typed.setHelpText(field[4]);
  if(field[0]==='inspectedAt')typed.setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}$').setHelpText('Informe DD/MM/AAAA HH:MM. Exemplo: 22/10/2026 08:30.').build());
  const sample=field[5]==='date'?new Date(2026,9,23):field[3]?field[3][0]:field[0]==='inspectedAt'?'22/10/2026 08:30':'MAPA';
  const link=form.createResponse().withItemResponse(typed.createResponse(sample)).toPrefilledUrl();
  const matches=Array.from(link.matchAll(/[?&](entry\.\d+(?:_year|_month|_day)?)=([^&]*)/g));
  if(!matches.length)throw new Error('Não foi possível mapear '+field[1]);
  map[field[0]]=matches[0][1].replace(/_(year|month|day)$/,'');
  if(field[5]==='date')dateEntries[field[0]]=matches.some(m=>/_(year|month|day)$/.test(m[1]))?'parts':'iso';
 }
 let destination='';try{destination=form.getDestinationId();}catch(error){}
 if(destination!==PLANILHA_ARVORES)form.setDestination(FormApp.DestinationType.SPREADSHEET,PLANILHA_ARVORES);
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='receberInspecaoArvores'&&t.getTriggerSourceId()===id))ScriptApp.newTrigger('receberInspecaoArvores').forForm(form).onFormSubmit().create();
 form.setPublished(true);form.setAcceptingResponses(true);
 const config={version:3,formUrl:form.getPublishedUrl(),entries:map,dateEntries};
 props.setProperty('FORMULARIO_ARVORES',id);props.setProperty('MAPA_ARVORES',JSON.stringify(config));
 if(priorId&&priorId!==id){props.setProperty('FORMULARIO_ARVORES_ANTERIOR',priorId);const prior=FormApp.openById(priorId);prior.setCustomClosedFormMessage('Este formulário foi atualizado. Acesse a versão atual: '+form.getPublishedUrl());prior.setAcceptingResponses(false);}
 book.getSheetByName('Orientacoes').getRange('A22:B24').setValues([
  ['Integração Google Forms','Versão 2.2. Dados do formulário web preenchidos automaticamente. Confirmar em Enviar.'],
  ['Editor do formulário',form.getEditUrl()],
  ['Mapeamento para formulário web',JSON.stringify(config)]
 ]);
 Logger.log('FORM_URL='+form.getPublishedUrl());Logger.log('EDIT_URL='+form.getEditUrl());Logger.log('CONFIG='+JSON.stringify(config));Logger.log('CAMPOS='+form.getItems().length);
}
function dataArvores(value){
 const text=String(value||'').trim();let m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text),year,month,day;
 if(m){year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);}else{m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!m)return '';day=Number(m[1]);month=Number(m[2]);year=Number(m[3]);}
 const check=new Date(Date.UTC(year,month-1,day));if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)return '';
 return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function dataHoraArvores(value){
 const text=String(value||'').trim();let m=/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})$/.exec(text);
 if(m){const date=dataArvores(m[1]);if(!date||Number(m[2])>23||Number(m[3])>59)return '';return new Date(date+'T'+m[2]+':'+m[3]+':00-03:00');}
 m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
 if(!m||!dataArvores(m[1])||Number(m[2])>23||Number(m[3])>59)return '';
 const date=new Date(text.replace(' ','T')+(m[4]?'':'-03:00'));return isNaN(date.getTime())?'':date;
}
function receberInspecaoArvores(e) {
 if(!e||!e.response)throw new Error('Execute esta função somente pelo acionador do Google Forms.');
 registrarRespostaArvores(e.response);
}
function registrarRespostaArvores(response) {
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try {
  const book=SpreadsheetApp.openById(PLANILHA_ARVORES),sheet=book.getSheetByName('Historico');
  const protocol=response.getId();
  const ids=sheet.getRange(2,1,Math.max(sheet.getMaxRows()-1,1),1).getValues().map(r=>String(r[0]));
  if(ids.includes(protocol))return;
  const answers={};for(const answer of response.getItemResponses())answers[answer.getItem().getTitle()]=String(answer.getResponse()||'');
  const v={fReason:answers['Justificativa de F']||'',eReason:answers['Justificativa de E']||'',cReason:answers['Justificativa de C']||'',measures:answers['Medidas adotadas / encaminhamento']||'',actionOwner:answers['Responsável pelas medidas']||'',followUp:answers['Prazo / próxima inspeção']||'',horizon:'',notes:'',scenarioId:'',scenarioUpdatedAt:'',previousProtocol:'',exclusionEvidence:'',controlOwner:'',controlValidity:''};for(const field of CAMPOS_ARVORES)v[field[0]]=answers[field[1]]||'';
  const f=Number(v.f.slice(1,2)),ex=Number(v.e.slice(1,2)),c=Number(v.c.slice(1,2));
  const errors=[];
  for(const field of CAMPOS_ARVORES)if(field[2]&&!v[field[0]].trim())errors.push(field[1]);
  const inspected=dataHoraArvores(v.inspectedAt),validity='',followUp=dataArvores(v.followUp);
  if(!inspected)errors.push('Data e hora: use DD/MM/AAAA HH:MM');if(v.followUp&&!followUp)errors.push('Prazo / próxima inspeção: selecione uma data válida');
  if(![1,2,3,4].includes(f)||![1,2,3].includes(ex)||![1,2,3,4].includes(c))errors.push('Classes F, E ou C');
  if(v.targetType==='Instalação / estrutura fixa alcançável'&&ex!==3)errors.push('Alvo fixo alcançável requer E3');
  const J=[[1,1,1,1],[1,1,2,2],[1,2,3,3],[1,2,3,4]],R=[[1,1,2,2],[1,2,3,3],[2,3,3,4],[2,3,4,4]];
  const j=errors.length?'':J[f-1][ex],r=errors.length?'':R[j-1][c-1];
  const name=r?['Baixa','Moderada','Alta','Crítica'][r-1]:'';
  let rowIndex=ids.findIndex(id=>!id);rowIndex=rowIndex<0?ids.length+2:rowIndex+2;
  if(rowIndex>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),1000);
  const row=[protocol,response.getTimestamp(),v.scenarioId,dataHoraArvores(v.scenarioUpdatedAt),v.treeId,v.location,v.species,v.component,v.target,v.targetType,v.scenarioStage,v.evaluator,inspected||v.inspectedAt,v.horizon,v.inspectionReason,v.reach,v.geometry,v.evidence,f,v.fReason,ex,v.eReason,c,v.cReason,j?'J'+j:'',r?'R'+r:'',name,f===4?'Proteção e afastamento imediatos':'',v.measures,v.actionOwner,followUp?new Date(followUp+'T12:00:00-03:00'):v.followUp,v.notes+(errors.length?'\nConferir preenchimento: '+errors.join('; '):''),v.exclusionEvidence,v.controlOwner,validity||v.controlValidity,'Google Forms',VERSAO_ARVORES];
  // Impede que texto de um respondente seja interpretado como fórmula.
  sheet.getRange(rowIndex,37).setNumberFormat('@');sheet.getRange(rowIndex,1,1,37).setValues([row.map(x=>typeof x==='string'&&/^[\s]*[=+@-]/.test(x)?"'"+x:x)]);
  sheet.getRange(rowIndex,38,1,4).setFormulas([[
   '=IF(A'+rowIndex+'="","",IF(COUNT(S'+rowIndex+',U'+rowIndex+',W'+rowIndex+')<3,"",INDEX(Matrizes!$B$4:$E$7,S'+rowIndex+',U'+rowIndex+'+1)))',
   '=IF(AL'+rowIndex+'="","","R"&INDEX(Matrizes!$H$4:$K$7,AL'+rowIndex+',W'+rowIndex+'))',
   '=IF(A'+rowIndex+'="","",IF(OR(AL'+rowIndex+'="",Y'+rowIndex+'="",Z'+rowIndex+'=""),"Conferir preenchimento",IF(AND("J"&AL'+rowIndex+'=Y'+rowIndex+',AM'+rowIndex+'=Z'+rowIndex+'),"Coerente","Divergência")))',
   ''
  ]].map(formulas=>formulas.map(formula=>formula.replace(/,/g,';'))));
  sheet.getRange(rowIndex,2).setNumberFormat('dd/MM/yyyy HH:mm');sheet.getRange(rowIndex,13).setNumberFormat('dd/MM/yyyy HH:mm');sheet.getRange(rowIndex,31).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(rowIndex,1,1,41).setWrap(true).setVerticalAlignment('top');
  sheet.autoResizeRows(rowIndex,1);
  SpreadsheetApp.flush();
 } finally { lock.releaseLock(); }
}
function recuperarEnviosArvores() {
 const id=PropertiesService.getScriptProperties().getProperty('FORMULARIO_ARVORES');
 if(!id)throw new Error('Configure o formulário receptor antes de recuperar envios.');
 for(const response of FormApp.openById(id).getResponses())registrarRespostaArvores(response);
 Logger.log('Recuperação concluída; protocolos existentes foram preservados sem duplicação.');
}
