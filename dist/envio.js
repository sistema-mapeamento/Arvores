'use strict';
// Envio da avaliação e das fotos direto para o banco (Supabase), sem Google Forms (12/11/2026).
// 1) registra a avaliação (registrar_inspecao: o banco recalcula J e R pela norma);
// 2) sobe cada foto em 2 tamanhos para o Storage: fotoN.jpg (inteira) e fotoN_mini.jpg (miniatura do mapa);
// 3) registra a foto (registrar_foto).
// Sem internet: avaliação e fotos ficam numa fila neste aparelho e vão sozinhas quando o sinal voltar.
// Reenvio não duplica (envio_id na avaliação; caminho fixo da foto).
(function () {
 const CFG = window.ARVORES_CONFIG || {};
 const FILA = 'arvores-fila-envio-v1', FILA_FOTOS = 'arvores-fila-fotos-v1';
 const $ = id => document.getElementById(id);
 const NOMES = { 1: 'Baixa', 2: 'Moderada', 3: 'Alta', 4: 'Crítica' };
 const cab = extra => Object.assign({ apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey }, extra || {});

 const ler = k => { try { const f = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(f) ? f : []; } catch { return []; } };
 const gravar = (k, f) => { try { localStorage.setItem(k, JSON.stringify(f)); } catch { /* sem espaço */ } };
 function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
 }
 function aviso(...partes) {
  const el = $('driveStatus'); if (!el) return;
  el.replaceChildren(...partes.filter(Boolean).map(p => typeof p === 'string' ? document.createTextNode(p) : p));
 }
 const negrito = t => { const b = document.createElement('strong'); b.textContent = t; return b; };
 const erro = (msg, definitivo) => Object.assign(new Error(msg), { definitivo });

 // ---------- avaliação ----------
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
 async function rpc(nome, corpo) {
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/' + nome, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw erro(j?.message || 'Erro ' + r.status, r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429);
  return j;
 }

 // ---------- fotos ----------
 function fotosDoAparelho(localId) {
  return new Promise(ok => {
   try {
    const rq = indexedDB.open('arvores-fotos-v1', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('registros');
    rq.onsuccess = () => { const g = rq.result.transaction('registros', 'readonly').objectStore('registros').get(localId); g.onsuccess = () => ok(g.result || []); g.onerror = () => ok([]); };
    rq.onerror = () => ok([]);
   } catch { ok([]); }
  });
 }
 async function miniatura(blob) {
  const img = await createImageBitmap(blob);
  const esc = Math.min(1, 480 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.close?.();
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.75));
 }
 async function subirArquivo(caminho, blob) {
  const r = await fetch(CFG.supabaseUrl + '/storage/v1/object/fotos/' + caminho, { method: 'POST', headers: cab({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: blob });
  if (r.ok) return;
  const j = await r.json().catch(() => null), txt = String(j?.message || j?.error || '');
  if (/exist|duplicate/i.test(txt) || r.status === 409) return;             // já subiu antes: segue
  throw erro('Foto: ' + (txt || 'erro ' + r.status), r.status === 400 || r.status === 403 || r.status === 413);
 }
 async function subirFoto(t) {   // t = { inspecao_id, arvore_id, localId, n }
  const lista = await fotosDoAparelho(t.localId), arq = lista[t.n - 1];
  if (!arq) return;               // foto removida do aparelho: nada a fazer
  const base = t.arvore_id + '/' + t.inspecao_id + '/foto' + t.n;
  const jpg = arq.type === 'image/jpeg' ? arq : await converter(arq);
  await subirArquivo(base + '.jpg', jpg);
  await subirArquivo(base + '_mini.jpg', await miniatura(jpg));
  await rpc('registrar_foto', { p_inspecao: t.inspecao_id, p_numero: t.n, p_bytes: jpg.size });
 }
 async function converter(arq) {
  const img = await createImageBitmap(arq), c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0); img.close?.();
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
 }
 async function processarFotos(tarefas, mostrar) {
  const resto = []; let ok = 0;
  for (const [i, t] of tarefas.entries()) {
   if (mostrar) aviso('Enviando foto ' + (i + 1) + ' de ' + tarefas.length + '…');
   try { await subirFoto(t); ok++; } catch (e) { if (!e.definitivo) resto.push(t); }
  }
  return { ok, resto };
 }

 // ---------- envio principal ----------
 async function enviar(item) {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { aviso('O site está sem banco configurado. A avaliação ficou salva só neste aparelho.'); return; }
  const p = montar(item), qtd = (await fotosDoAparelho(item.id)).length;
  aviso('Enviando a avaliação…');
  let res;
  try { res = await rpc('registrar_inspecao', { p }); }
  catch (e) {
   if (e.definitivo) { aviso(negrito('Não foi possível registrar: '), e.message); return; }
   const f = ler(FILA); f.push({ p, localId: item.id, fotos: qtd }); gravar(FILA, f);
   aviso(negrito('Sem conexão agora. '), 'A avaliação' + (qtd ? ' e as ' + qtd + ' fotos ficaram guardadas' : ' ficou guardada') + ' neste aparelho e vão sozinhas quando a internet voltar.');
   return;
  }
  const tarefas = Array.from({ length: qtd }, (_, i) => ({ inspecao_id: res.id, arvore_id: p.arvore_id, localId: item.id, n: i + 1 }));
  const { ok, resto } = await processarFotos(tarefas, true);
  if (resto.length) gravar(FILA_FOTOS, ler(FILA_FOTOS).concat(resto));
  const ver = document.createElement('a'); ver.href = '../#' + encodeURIComponent(p.arvore_id); ver.textContent = 'Ver no mapa';
  // toda avaliação gera uma ação (SQL 04): no celular abre direto a tela de Ações; no computador fica o link
  const acao = '../acoes/?arvore=' + encodeURIComponent(p.arvore_id) + '&nova=1';
  const irAcao = document.createElement('a'); irAcao.href = acao; irAcao.textContent = 'Abrir a ação gerada';
  aviso(negrito('Avaliação registrada. '), 'Árvore ' + p.arvore_id + ' · R' + res.r + ' ' + (NOMES[res.r] || '') + '. ',
   qtd ? (ok + ' de ' + qtd + (qtd > 1 ? ' fotos enviadas' : ' foto enviada') + (resto.length ? ' (as outras vão quando a internet melhorar)' : '') + '. ') : '', irAcao, ' · ', ver);
  if (matchMedia('(max-width: 768px)').matches) setTimeout(() => location.assign(acao), 1200);
 }

 let ocupado = false;
 async function esvaziar() {
  if (ocupado || !navigator.onLine || !CFG.supabaseUrl) return;
  const fila = ler(FILA), filaFotos = ler(FILA_FOTOS);
  if (!fila.length && !filaFotos.length) return;
  ocupado = true;
  try {
   const resto = [], novas = []; let ok = 0;
   for (const x of fila) {
    const p = x.p || x;   // formato antigo guardava só a avaliação
    try {
     const res = await rpc('registrar_inspecao', { p }); ok++;
     for (let n = 1; n <= (x.fotos || 0); n++) novas.push({ inspecao_id: res.id, arvore_id: p.arvore_id, localId: x.localId, n });
    } catch (e) { if (!e.definitivo) resto.push(x); }
   }
   gravar(FILA, resto);
   const r = await processarFotos(filaFotos.concat(novas), false);
   gravar(FILA_FOTOS, r.resto);
   if (ok || r.ok) aviso(negrito('Pendências enviadas: '), (ok ? ok + ' avaliação(ões)' : '') + (ok && r.ok ? ' e ' : '') + (r.ok ? r.ok + ' foto(s)' : '') + '.',
    resto.length || r.resto.length ? ' Ainda faltam ' + (resto.length + r.resto.length) + '.' : '');
  } finally { ocupado = false; }
 }
 window.addEventListener('online', esvaziar);
 setTimeout(esvaziar, 1500);
 setInterval(esvaziar, 60000);

 window.TreeEnvio = { enviar, pendentes: () => ler(FILA).length + ler(FILA_FOTOS).length };
})();
