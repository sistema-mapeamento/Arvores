'use strict';
// Ações (13/11/2026). Toda avaliação gera uma ação aberta (o banco cria sozinho, SQL 04).
// Dar baixa = escolher PODA, PODA DRÁSTICA ou SUPRESSÃO + fotos do pós + comentário + quem deu baixa.
// Sem internet a baixa fica guardada neste aparelho e vai sozinha quando o sinal voltar (fotos também).
// Endereços: ?arvore=ID abre a baixa da ação aberta daquela árvore; ?arvore=ID&nova=1 (depois de avaliar) só destaca a ação.
(function () {
 const $ = id => document.getElementById(id);
 const CFG = window.ARVORES_CONFIG || {};
 const PARAMS = new URLSearchParams(location.search);
 const EXEMPLO = PARAMS.has('exemplo') || !CFG.supabaseUrl;
 const NOMES = { 1: 'Baixa', 2: 'Moderada', 3: 'Alta', 4: 'Crítica' };
 const TIPO = { poda: 'Poda', poda_drastica: 'Poda drástica', supressao: 'Supressão' };
 const STATUS = { aberta: 'Aberta', concluida: 'Com baixa', substituida: 'Substituída' };
 const FILA = 'arvores-fila-baixas-v1', RESP = 'arvores-responsavel-baixa';
 const MAX_FOTOS = 3, MAX_LADO = 1280;
 const state = { acoes: [], st: 'aberta', q: '', limite: 40, atual: null, fotos: [], destaque: '' };
 let areas = [];

 // ---------- utilidades ----------
 function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
   if (k === 'class') e.className = v; else if (k === 'on') e.addEventListener('click', v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null && k !== false) e.append(k);
  return e;
 }
 const p2 = n => String(n).padStart(2, '0');
 const dataBR = d => d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : '—';
 const horaBR = d => d ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : '';
 const norm = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
 const titulo = s => String(s || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
 const risco = r => r ? el('span', { class: 'risk' }, el('i', { class: 'dot r' + r }), 'R' + r + ' · ' + NOMES[r]) : el('span', { class: 'risk' }, 'Sem R');
 const cab = extra => Object.assign({ apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey }, extra || {});
 const urlFoto = (c, mini) => c.includes('/') ? CFG.supabaseUrl + '/storage/v1/object/public/fotos/' + c.split('/').map(encodeURIComponent).join('/') + (mini ? '_mini.jpg' : '.jpg')
  : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(c) + '&sz=w1000';
 const ler = k => { try { const f = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(f) ? f : []; } catch { return []; } };
 const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };
 const erro = (msg, definitivo) => Object.assign(new Error(msg), { definitivo });
 function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
 }

 // ---------- áreas da usina ----------
 function dentro(lon, lat, ring) { let ok = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok; } return ok; }
 function areaDe(lat, lon) {
  if (lat == null) return '';
  let b = null; for (const a of areas) if (dentro(lon, lat, a.ring) && (!b || a.size < b.size)) b = a;
  return b ? b.nome : 'Fora das áreas';
 }
 async function carregarAreas() {
  try {
   const g = await (await fetch('../dados/cercas.geojson', { cache: 'force-cache' })).json();
   areas = g.features.filter(f => f.properties?.tipo !== 'planta' && f.geometry?.coordinates?.[0]).map(f => {
    const ring = f.geometry.coordinates[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    return { nome: titulo(f.properties.nome), ring, size: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
   });
  } catch { areas = []; }
 }

 // ---------- dados ----------
 async function carregar() {
  if (EXEMPLO) {
   // exemplo: 1 ação por avaliação; só a mais recente de cada árvore fica aberta
   const t = (await (await fetch('../exemplo/historico.json', { cache: 'no-store' })).json()).table.slice(1);
   const linhas = t.map((r, i) => {
    const m = String(r[8]).match(/(-?\d+\.\d+);\s*(-?\d+\.\d+)/), [d, mo, y] = String(r[7]).slice(0, 10).split('/'), [h, mi] = String(r[7]).slice(11, 16).split(':');
    const quando = new Date(+y, mo - 1, +d, +h || 0, +mi || 0);
    return { id: 'ex-' + i, arvore: r[0], status: 'aberta', tipo: null, comentario: '', responsavel: '', concluida: null, criada: quando, avaliada: quando,
     r: +String(r[9]).slice(1), comp: r[3], alvo: r[4], lat: m ? +m[1] : null, lon: m ? +m[2] : null,
     antes: String(r[10] || '').split(';').filter(Boolean).map(u => ({ mini: '../' + u, grande: '../' + u })), pos: [] };
   });
   const ultima = new Map(); for (const a of linhas) { const u = ultima.get(a.arvore); if (!u || a.avaliada > u.avaliada) ultima.set(a.arvore, a); }
   for (const a of linhas) if (ultima.get(a.arvore) !== a) a.status = 'substituida';
   return linhas;
  }
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/acoes_publicas?select=*&order=criado_em.desc&limit=20000', { cache: 'no-store', headers: cab() });
  if (!r.ok) throw erro('banco ' + r.status, r.status === 404);
  return (await r.json()).map(x => ({
   id: x.id, arvore: x.arvore_id, status: x.status, tipo: x.tipo, comentario: x.comentario || '', responsavel: x.responsavel || '',
   concluida: x.concluida_em ? new Date(x.concluida_em) : null, criada: new Date(x.criado_em), avaliada: new Date(x.inspecionado_em),
   r: x.r, comp: x.componente, alvo: x.alvo, lat: x.latitude, lon: x.longitude,
   antes: (x.fotos_antes || []).map(c => ({ mini: urlFoto(c, true), grande: urlFoto(c, false) })),
   pos: (x.fotos_pos || []).map(c => ({ mini: urlFoto(c, true), grande: urlFoto(c, false) }))
  }));
 }

 // ---------- lista ----------
 function pendenteLocal(id) { return ler(FILA).some(x => x.p.acao_id === id); }
 function render() {
  const visiveis = state.acoes.filter(a => a.status !== 'substituida');
  const n = { aberta: 0, concluida: 0 };
  for (const a of visiveis) if (n[a.status] !== undefined) n[a.status]++;
  $('nAbertas').textContent = n.aberta; $('nConcluidas').textContent = n.concluida; $('nTodas').textContent = visiveis.length;
  for (const b of document.querySelectorAll('.ac-seg button')) b.setAttribute('aria-pressed', String(b.dataset.st === state.st));

  const q = norm(state.q);
  let lista = visiveis.filter(a => (!state.st || a.status === state.st) && (!q || norm([a.arvore, a.area, a.comp, a.alvo, a.responsavel, a.comentario, TIPO[a.tipo]].join(' ')).includes(q)));
  lista.sort((a, b) => a.status === b.status
   ? (a.status === 'aberta' ? (b.r || 0) - (a.r || 0) || a.criada - b.criada : (b.concluida || 0) - (a.concluida || 0))
   : a.status === 'aberta' ? -1 : 1);
  $('lista').replaceChildren(...lista.slice(0, state.limite).map(cartao));
  $('vazio').hidden = lista.length > 0;
  $('mais').hidden = lista.length <= state.limite;
  const pend = ler(FILA).length;
  $('pendentes').hidden = !pend;
  $('pendentes').textContent = pend + (pend > 1 ? ' baixas guardadas' : ' baixa guardada') + ' neste aparelho, esperando internet para enviar.';
 }
 function miniaturas(fotos, cls) {
  if (!fotos.length) return null;
  return el('div', { class: cls }, ...fotos.slice(0, 5).map(f => el('button', { type: 'button', 'aria-label': 'Ampliar foto', on: () => ampliar(f.grande) }, el('img', { src: f.mini, alt: '', loading: 'lazy' }))));
 }
 function cartao(a) {
  const pend = a.status === 'aberta' && pendenteLocal(a.id);
  const chip = a.status === 'concluida' ? el('span', { class: 'chip t-' + a.tipo }, TIPO[a.tipo] || 'Com baixa')
   : pend ? el('span', { class: 'chip pend' }, 'Baixa aguardando internet') : el('span', { class: 'chip aberta' }, 'Aberta');
  const li = el('li', { class: 'ac st-' + a.status + (state.destaque === a.arvore && a.status === 'aberta' ? ' destaque' : ''), id: 'acao-' + a.id },
   el('div', { class: 'ac-topo' },
    a.antes[0] ? el('button', { type: 'button', class: 'ac-th', 'aria-label': 'Ampliar foto da avaliação', on: () => ampliar(a.antes[0].grande) }, el('img', { src: a.antes[0].mini, alt: '', loading: 'lazy' })) : el('span', { class: 'ac-th vazio-th' }),
    el('div', { class: 'ac-txt' }, el('strong', {}, a.arvore), el('small', {}, [a.area || 'Sem coordenadas', a.comp].filter(Boolean).join(' · ')), el('small', {}, 'Avaliada em ' + dataBR(a.avaliada))),
    el('div', { class: 'ac-dir' }, risco(a.r), chip)),
   a.status === 'concluida' ? el('div', { class: 'ac-baixa' },
    el('p', {}, el('b', {}, 'Baixa em ' + dataBR(a.concluida) + ' ' + horaBR(a.concluida)), ' por ' + a.responsavel),
    a.tipo === 'supressao' ? el('p', { class: 'sup' }, 'Árvore suprimida: não aparece mais no mapa.') : null,
    a.comentario ? el('p', { class: 'com' }, a.comentario) : null,
    miniaturas(a.pos, 'ac-pos')) : null,
   el('div', { class: 'ac-acoes' },
    a.status === 'aberta' && !pend ? el('button', { type: 'button', class: 'ac-pri', on: () => abrirBaixa(a) }, 'Dar baixa') : null,
    a.lat != null && !(a.status === 'concluida' && a.tipo === 'supressao') ? el('a', { class: 'ac-sec', href: '../' + (EXEMPLO ? '?exemplo' : '') + '#' + encodeURIComponent(a.arvore) }, 'Ver no mapa') : null,
    el('a', { class: 'ac-sec', href: '../avaliar/?arvore=' + encodeURIComponent(a.arvore) }, 'Reavaliar')));
  return li;
 }

 // ---------- fotos ----------
 function ampliar(url) { $('lbImg').src = url; $('lb').showModal(); }
 $('lbX').addEventListener('click', () => $('lb').close());
 $('lb').addEventListener('click', e => { if (e.target === $('lb')) $('lb').close(); });

 async function abrirImagem(file) {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* outro jeito */ } }
  return await new Promise((ok, falha) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => { URL.revokeObjectURL(u); falha(new Error('imagem')); }; img.src = u; });
 }
 async function preparar(file) {   // reduz para 1280 px e carimba: ID · PÓS · data/hora
  const img = await abrirImagem(file), esc = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  const w = Math.round(img.width * esc), h = Math.round(img.height * esc);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); img.close?.();
  const d = new Date(), fs = Math.max(14, Math.round(w / 48)), pad = Math.round(fs * 0.7), alt = fs * 2 + pad * 2.4;
  const grad = g.createLinearGradient(0, h - alt * 1.5, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.35, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,.72)');
  g.fillStyle = grad; g.fillRect(0, h - alt * 1.5, w, alt * 1.5);
  g.fillStyle = '#fff'; g.textBaseline = 'bottom'; g.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
  g.fillText((state.atual?.arvore || 'Árvore') + '  ·  PÓS  ·  ' + dataBR(d) + ' ' + horaBR(d), pad, h - pad - fs * 1.15);
  g.font = '400 ' + Math.round(fs * 0.85) + 'px "Segoe UI", Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,.88)';
  const tipo = new FormData($('baixa')).get('tipo');
  g.fillText('Baixa da ação' + (tipo ? ': ' + TIPO[tipo].toUpperCase() : ''), pad, h - pad);
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.8));
 }
 async function miniatura(blob) {
  const img = await createImageBitmap(blob), esc = Math.min(1, 480 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.close?.();
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.75));
 }
 async function receber(input) {
  const arqs = Array.from(input.files || []); input.value = '';
  for (const f of arqs) {
   if (state.fotos.length >= MAX_FOTOS) { $('posDica').textContent = 'Limite de 3 fotos do pós.'; break; }
   if (!/^image\//.test(f.type)) continue;
   $('posDica').textContent = 'Preparando foto…';
   try { state.fotos.push(await preparar(f)); } catch { $('posDica').textContent = 'Não foi possível ler esta foto.'; continue; }
   $('posDica').textContent = 'Até 3 fotos. Cada foto recebe ID da árvore, "PÓS", data e hora.';
  }
  desenharFotos();
 }
 let urls = [];
 function desenharFotos() {
  for (const u of urls) URL.revokeObjectURL(u); urls = [];
  $('posFotos').replaceChildren(...state.fotos.map((b, i) => {
   const u = URL.createObjectURL(b); urls.push(u);
   return el('li', {}, el('img', { src: u, alt: 'Foto do pós ' + (i + 1) }), el('button', { type: 'button', 'aria-label': 'Remover foto ' + (i + 1), on: () => { state.fotos.splice(i, 1); desenharFotos(); } }, '×'));
  }));
  $('btnCam').disabled = $('btnGal').disabled = state.fotos.length >= MAX_FOTOS;
 }
 $('btnCam').addEventListener('click', () => $('inCam').click());
 $('btnGal').addEventListener('click', () => $('inGal').click());
 $('inCam').addEventListener('change', e => receber(e.target));
 $('inGal').addEventListener('change', e => receber(e.target));

 // ---------- janela de baixa ----------
 function abrirBaixa(a) {
  state.atual = a; state.fotos = []; desenharFotos();
  const f = $('baixa'); f.reset();
  try { f.elements.responsavel.value = localStorage.getItem(RESP) || ''; } catch { /* nada */ }
  $('dlgArvore').replaceChildren(el('b', {}, a.arvore), ' · ', risco(a.r), ' · avaliada em ' + dataBR(a.avaliada));
  $('erro').hidden = true; $('enviar').disabled = false; $('enviar').textContent = 'Dar baixa';
  $('dlg').showModal();
 }
 const fechar = () => { $('dlg').close(); state.atual = null; };
 $('dlgFechar').addEventListener('click', fechar);
 $('dlgCancelar').addEventListener('click', fechar);
 function mostrarErro(msg, campo) { $('erro').textContent = msg; $('erro').hidden = false; campo?.focus?.(); }

 $('baixa').addEventListener('submit', async e => {
  e.preventDefault();
  const f = $('baixa'), a = state.atual; if (!a) return;
  const tipo = new FormData(f).get('tipo'), comentario = f.elements.comentario.value.trim(), responsavel = f.elements.responsavel.value.trim();
  if (!tipo) return mostrarErro('Escolha o que foi feito: Poda, Poda drástica ou Supressão.', f.querySelector('input[name="tipo"]'));
  if (comentario.length < 3) return mostrarErro('Escreva um comentário sobre o serviço.', f.elements.comentario);
  if (responsavel.length < 3) return mostrarErro('Informe quem deu baixa na ação.', f.elements.responsavel);
  try { localStorage.setItem(RESP, responsavel); } catch { /* nada */ }
  $('erro').hidden = true; $('enviar').disabled = true;

  if (EXEMPLO) {   // exemplo: nada vai para o banco
   Object.assign(a, { status: 'concluida', tipo, comentario, responsavel, concluida: new Date(), pos: state.fotos.map(b => { const u = URL.createObjectURL(b); return { mini: u, grande: u }; }) });
   fechar(); aviso('DADOS DE EXEMPLO: baixa simulada, nada foi enviado ao banco.'); render(); return;
  }
  const item = { p: { acao_id: a.id, envio_id: novoId(), tipo, comentario, responsavel }, arvore: a.arvore, fotos: state.fotos.length, feitas: [], etapa: 'baixa' };
  try { if (item.fotos) await fotosGuardar(item.p.envio_id, state.fotos); }
  catch { $('enviar').disabled = false; return mostrarErro('Não foi possível guardar as fotos neste aparelho. Libere espaço e tente de novo.'); }
  gravar(FILA, ler(FILA).concat(item));
  try {
   $('enviar').textContent = 'Enviando…';
   const r = await processar(item, t => { $('enviar').textContent = t; });
   fechar();
   aviso('Baixa registrada: árvore ' + a.arvore + ' · ' + TIPO[tipo] + '.' + (r.faltam ? ' ' + r.faltam + ' foto(s) vão quando a internet melhorar.' : ''));
   await atualizar();
  } catch (x) {
   if (x.definitivo) { tirarDaFila(item.p.envio_id); $('enviar').disabled = false; $('enviar').textContent = 'Dar baixa'; return mostrarErro('Não foi possível dar baixa: ' + x.message); }
   fechar(); aviso('Sem conexão agora. A baixa da árvore ' + a.arvore + ' ficou guardada neste aparelho e vai sozinha quando a internet voltar.'); render();
  }
 });

 // ---------- envio (com fila sem internet) ----------
 async function rpc(nome, corpo) {
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/' + nome, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw erro(j?.message || 'Erro ' + r.status, r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429);
  return j;
 }
 async function subirArquivo(caminho, blob) {
  const r = await fetch(CFG.supabaseUrl + '/storage/v1/object/fotos/' + caminho, { method: 'POST', headers: cab({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: blob });
  if (r.ok) return;
  const j = await r.json().catch(() => null), txt = String(j?.message || j?.error || '');
  if (/exist|duplicate/i.test(txt) || r.status === 409) return;
  throw erro('Foto: ' + (txt || 'erro ' + r.status), r.status === 400 || r.status === 403 || r.status === 413);
 }
 function idb(modo, fn) {
  return new Promise((ok, falha) => {
   const rq = indexedDB.open('arvores-pos-v1', 1);
   rq.onupgradeneeded = () => rq.result.createObjectStore('baixas');
   rq.onerror = () => falha(rq.error);
   rq.onsuccess = () => { const tx = rq.result.transaction('baixas', modo), q = fn(tx.objectStore('baixas')); tx.oncomplete = () => ok(q.result); tx.onerror = tx.onabort = () => falha(tx.error); };
  });
 }
 const fotosGuardar = (id, blobs) => idb('readwrite', s => s.put(blobs, id));
 const fotosLer = id => idb('readonly', s => s.get(id)).catch(() => []);
 const fotosApagar = id => idb('readwrite', s => s.delete(id)).catch(() => null);
 function tirarDaFila(envio) { gravar(FILA, ler(FILA).filter(x => x.p.envio_id !== envio)); fotosApagar(envio); }
 function salvarNaFila(item) { gravar(FILA, ler(FILA).map(x => x.p.envio_id === item.p.envio_id ? item : x)); }

 async function processar(item, mostrar) {
  if (item.etapa === 'baixa') {
   mostrar?.('Enviando a baixa…');
   await rpc('dar_baixa_acao', { p: item.p });
   item.etapa = 'fotos'; salvarNaFila(item);
  }
  const blobs = item.fotos ? (await fotosLer(item.p.envio_id)) || [] : [];
  let faltam = 0;
  for (let n = 1; n <= item.fotos; n++) {
   if (item.feitas.includes(n)) continue;
   const b = blobs[n - 1]; if (!b) { item.feitas.push(n); continue; }
   mostrar?.('Enviando foto ' + n + ' de ' + item.fotos + '…');
   const base = item.arvore + '/' + item.p.acao_id + '/pos' + n;
   try {
    await subirArquivo(base + '.jpg', b);
    await subirArquivo(base + '_mini.jpg', await miniatura(b));
    await rpc('registrar_foto_pos', { p_acao: item.p.acao_id, p_numero: n, p_bytes: b.size });
    item.feitas.push(n);
   } catch (x) { if (x.definitivo) item.feitas.push(n); else faltam++; }
   salvarNaFila(item);
  }
  if (!faltam) tirarDaFila(item.p.envio_id);
  return { faltam };
 }
 let ocupado = false;
 async function esvaziar() {
  if (ocupado || EXEMPLO || !navigator.onLine) return;
  const fila = ler(FILA); if (!fila.length) return;
  ocupado = true; let ok = 0;
  try {
   for (const item of fila) {
    try { const r = await processar(item); if (!r.faltam) ok++; }
    catch (x) { if (x.definitivo) tirarDaFila(item.p.envio_id); }
   }
  } finally { ocupado = false; }
  if (ok) { aviso(ok + (ok > 1 ? ' baixas guardadas foram enviadas.' : ' baixa guardada foi enviada.')); await atualizar(); } else render();
 }
 window.addEventListener('online', esvaziar);
 setInterval(esvaziar, 60000);

 // ---------- avisos e início ----------
 function aviso(txt) { $('avisoNova').textContent = txt; $('avisoNova').hidden = false; $('avisoNova').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
 for (const b of document.querySelectorAll('.ac-seg button')) b.addEventListener('click', () => { state.st = b.dataset.st; state.limite = 40; render(); });
 $('busca').addEventListener('input', () => { state.q = $('busca').value; state.limite = 40; render(); });
 $('mais').addEventListener('click', () => { state.limite += 40; render(); });

 async function atualizar(pronto) {
  $('status').textContent = 'Atualizando…';
  try {
   const novas = await (pronto || carregar());
   const locais = new Map(state.acoes.map(a => [a.id, a]));
   state.acoes = novas.map(a => EXEMPLO && locais.get(a.id)?.status === 'concluida' ? locais.get(a.id) : { ...a, area: areaDe(a.lat, a.lon) });
   $('status').textContent = (EXEMPLO ? 'DADOS DE EXEMPLO · ' : '') + 'Atualizado às ' + horaBR(new Date());
  } catch (x) {
   $('status').textContent = x.definitivo ? 'Falta rodar o SQL 04 (ações) no banco' : navigator.onLine ? 'Banco indisponível agora' : 'Sem conexão';
  }
  render();
 }
 async function iniciar() {
  const p = carregar(); p.catch(() => { /* tratado no atualizar */ });   // busca as ações junto com as cercas
  await carregarAreas();
  await atualizar(p);
  const arv = PARAMS.get('arvore'), nova = PARAMS.has('nova');
  if (arv) {
   const a = state.acoes.find(x => x.arvore === arv && x.status === 'aberta');
   if (nova) {
    state.destaque = arv; state.st = 'aberta'; render();
    aviso('Avaliação da árvore ' + arv + ' registrada. A ação dela está aberta abaixo: dê baixa quando o serviço for feito.');
    if (a) setTimeout(() => $('acao-' + a.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
   } else if (a) abrirBaixa(a);
   else { state.st = ''; state.q = arv; $('busca').value = arv; render(); }
   const limpa = new URL(location.href); limpa.searchParams.delete('arvore'); limpa.searchParams.delete('nova'); history.replaceState(null, '', limpa);
  }
  setTimeout(esvaziar, 1500);
 }
 // modo exemplo continua ao trocar de tela
 if (PARAMS.has('exemplo')) for (const a of document.querySelectorAll('.nav a, .logo')) { const h = a.getAttribute('href'); if (h && !h.includes('?')) a.setAttribute('href', h + '?exemplo'); }
 iniciar();
 setInterval(() => { if (!document.hidden && !$('dlg').open) atualizar(); }, 5 * 60 * 1000);
})();
