(function (root) {
  'use strict';
  const J = [[1,1,1,1],[1,1,2,2],[1,2,3,3],[1,2,3,4]];
  const R = [[1,1,2,2],[1,2,3,3],[2,3,3,4],[2,3,4,4]];
  const names = {1:'Baixa',2:'Moderada',3:'Alta',4:'Crítica'};
  const actions = {
    1:'Manter os controles e o acompanhamento definidos tecnicamente. Registrar novas ocupações, alvos e sinais de alteração; resultado baixo não dispensa inspeção da árvore.',
    2:'Programar tratamento com responsável, prazo e monitoramento. Manter barreiras compatíveis com o cenário até a decisão técnica; antecipar atendimento se houver mudança.',
    3:'Priorizar avaliação e tratamento. Proteger ocupantes e instalações com retirada, desvio ou restrição de acesso, conforme o cenário; manter exposição apenas com controles demonstrados.',
    4:'Implantar proteção imediata dos alvos, com isolamento/interdição e acionamento dos responsáveis. Definir solução técnica e controles industriais; urgência não autoriza execução improvisada.'
  };
  function evaluate(v) {
    const immediate=v.f==='4';
    const base={immediate,j:null,r:null};
    if(!v.f || !v.e || !v.c || !v.reach) return {...base,status:'empty'};
    if(v.reach!=='verificado') return {...base,status:'invalid',reason:'Confirme a verificação de alcance e distâncias.'};
    if(v.targetType==='fixo' && v.e!=='3') return {...base,status:'invalid',reason:'Alvo fixo alcançável permanece E3.'};
    if(v.e==='0' && (!v.exclusionEvidence?.trim() || !v.controlOwner?.trim() || !v.controlValidity)) return {...base,status:'excluded_pending'};
    if(!/^[1-4]$/.test(v.f) || !/^[0-3]$/.test(v.e) || !/^[1-4]$/.test(v.c)) return {...base,status:'invalid',reason:'Seleção inválida.'};
    const j=J[Number(v.f)-1][Number(v.e)];
    const r=R[j-1][Number(v.c)-1];
    return {...base,status:'ok',j,r,name:names[r],action:actions[r]};
  }
  const api={J,R,names,actions,evaluate};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.TreeRisk=api;
})(typeof window!=='undefined'?window:globalThis);
