'use strict';
// Abertura rápida (13/11): começa a buscar avaliações e ações no banco logo que a página abre,
// enquanto o mapa (Leaflet) ainda está baixando. O mapa/app.js usa estas buscas já em andamento.
(function () {
 const CFG = window.ARVORES_CONFIG || {};
 if (new URLSearchParams(location.search).has('exemplo') || !CFG.supabaseUrl) return;
 const cab = { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey };
 const pegar = caminho => fetch(CFG.supabaseUrl + '/rest/v1/' + caminho, { cache: 'no-store', headers: cab }).then(r => { if (!r.ok) throw new Error('banco ' + r.status); return r.json(); });
 const h = pegar('inspecoes_publicas?select=*&order=inspecionado_em.desc&limit=20000');
 const a = pegar('acoes_publicas?select=arvore_id,status,tipo,concluida_em,responsavel,inspecionado_em&status=neq.substituida&order=inspecionado_em.desc&limit=20000');
 h.catch(() => {}); a.catch(() => {});
 window.ARVORES_CEDO = { historico: h, acoes: a };
})();
