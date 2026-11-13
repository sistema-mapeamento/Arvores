'use strict';
// Envio da avaliação direto para o banco (Supabase), sem Google Forms (12/11/2026).
// Sem internet: a avaliação entra numa fila neste aparelho e é enviada sozinha quando o sinal voltar.
// O banco recalcula J e R pela regra da norma; reenvio da mesma avaliação não duplica (envio_id).
(function () {
 const CFG = window.ARVORES_CONFIG || {};
 const FILA = 'arvores-fila-envio-v1';
 const $ = id => document.getElementById(id);
 const NOMES = { 1: 'Baixa', 2: 'Moderada', 3: 'Alta', 4: 'Crítica' };

 function lerFila() { try { const f = JSON.parse(localStorage.getItem(FILA) || '[]'); return Array.isArray(f) ? f : []; } catch { return []; } }
 function gravarFila(f) { try { localStorage.setItem(FILA, JSON.stringify(f)); } catch { /* sem espaço */ } }
 function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
 }
 function aviso(...partes) {
  const el = $('driveStatus'); if (!el) return;
  el.replaceChildren(...partes.map(p => typeof p === 'string' ? document.createTextNode(p) : p));
 }
 function negrito(t) { const b = document.createElement('strong'); b.textContent = t; return b; }

 function montar(item) {
  const d = item.data || {};
  const [lat, lon] = String(d.coordinates || '').split(',').map(x => x.trim());
  let quando = null;
  try { const t = new Date(d.inspectedAt); if (!isNaN(t)) quando = t.toISOString(); } catch { /* usa agora */ }
  const evid = [d.evidence, d.photoLinks ? 'Links das fotos:\n' + d.photoLinks : ''].filter(Boolean).join('\n\n');
  return {
   envio_id: novoId(), arvore_id: d.treeId, latitude: lat || null, longitude: lon || null, especie: d.species || null,
   componente: d.component, avaliador: d.evaluator, inspecionado_em: quando, motivo: d.inspectionReason || 'rotina',
   tipo_alvo: d.targetType, alvo: d.target, situacao_controles: d.scenarioStage || 'inicial',
   alcance_verificado: d.reach === 'verificado', f: Number(d.f), e: Number(d.e), c: Number(d.c),
   geometria: d.geometry, evidencias: evid, observacoes: d.notes || null
  };
 }

 async function postar(p) {
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/registrar_inspecao', {
   method: 'POST',
   headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'Content-Type': 'application/json' },
   body: JSON.stringify({ p })
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
   const e = new Error(corpo?.message || 'Erro ' + r.status);
   e.definitivo = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
   throw e;
  }
  return corpo;
 }

 async function enviar(item) {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { aviso('O site está sem banco configurado. A avaliação ficou salva só neste aparelho.'); return; }
  const p = montar(item);
  aviso('Enviando a avaliação…');
  try {
   const res = await postar(p);
   const ver = document.createElement('a');
   ver.href = '../#' + encodeURIComponent(p.arvore_id); ver.textContent = 'Ver no mapa';
   aviso(negrito('Avaliação registrada. '), 'Árvore ' + p.arvore_id + ' · R' + res.r + ' ' + (NOMES[res.r] || '') + '. ', ver);
  } catch (e) {
   if (e.definitivo) { aviso(negrito('Não foi possível registrar: '), e.message); return; }
   const f = lerFila(); f.push(p); gravarFila(f);
   aviso(negrito('Sem conexão agora. '), 'A avaliação ficou guardada neste aparelho e será enviada sozinha quando a internet voltar.');
  }
 }

 let esvaziando = false;
 async function esvaziar() {
  const fila = lerFila();
  if (esvaziando || !fila.length || !navigator.onLine || !CFG.supabaseUrl) return;
  esvaziando = true;
  const resto = []; let ok = 0;
  for (const p of fila) {
   try { await postar(p); ok++; } catch (e) { if (!e.definitivo) resto.push(p); }
  }
  gravarFila(resto); esvaziando = false;
  if (ok) aviso(negrito(ok + (ok > 1 ? ' avaliações guardadas foram enviadas.' : ' avaliação guardada foi enviada.')), resto.length ? ' Ainda faltam ' + resto.length + '.' : '');
 }
 window.addEventListener('online', esvaziar);
 setTimeout(esvaziar, 1500);
 setInterval(esvaziar, 60000);

 window.TreeEnvio = { enviar, pendentes: () => lerFila().length };
})();
