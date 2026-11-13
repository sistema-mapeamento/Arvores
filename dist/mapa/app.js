'use strict';
(function () {
 const D = window.TreeMapData, $ = id => document.getElementById(id);
 const NOMES = { 1: 'Baixa', 2: 'Moderada', 3: 'Alta', 4: 'Crítica' };
 const COR = { 1: '#2f9e6a', 2: '#d6a51c', 3: '#dd5a26', 4: '#a8243a' };
 const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
 const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['', 'Todo o histórico']];
 const state = { rows: [], areas: [], risks: null, area: '', period: '90', sel: null, first: true, exemplo: false, acoes: null, q: '', limit: 60 };

 function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
   if (k === 'class') e.className = v; else if (k === 'on') e.addEventListener('click', v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
 }
 const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const titulo = s => String(s || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
 const dataBR = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
 const riskTag = r => r ? el('span', { class: 'risk' }, el('i', { class: 'dot r' + r }), 'R' + r + ' · ' + NOMES[r]) : el('span', { class: 'risk' }, 'Sem R');
 function fotosDe(tree) {
  const vistos = new Set(), out = [];
  for (const r of state.rows.filter(x => x.tree === tree).sort((a, b) => (b.stamp || '').localeCompare(a.stamp || '')))
   for (const u of r.photos || []) if (!vistos.has(u)) { vistos.add(u); out.push({ url: u, data: dataBR(r.stamp) }); }
  return out;
 }
 function thumb(url) { const i = el('img', { class: 'th', src: url, alt: '', loading: 'lazy' }); return i; }
 const norm = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

 // ---------- mapa ----------
 const map = L.map('map', { minZoom: 12, maxZoom: 19 }).setView([-19.48, -42.53], 14);
 L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagem: Esri, Maxar, Earthstar Geographics'
 }).addTo(map);
 map.zoomControl.setPosition('bottomright');
 const fenceLayer = L.layerGroup().addTo(map), pointLayer = L.layerGroup().addTo(map);
 let plantBounds = null;

 function inside(lon, lat, ring) {
  let ok = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
   const [xi, yi] = ring[i], [xj, yj] = ring[j];
   if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
 }
 function areaOf(geo) {
  if (!geo) return '';
  let best = null;
  for (const a of state.areas) if (inside(geo.lon, geo.lat, a.ring) && (!best || a.size < best.size)) best = a;
  return best ? best.nome : 'Fora das áreas';
 }

 async function loadFences() {
  const res = await fetch('dados/cercas.geojson', { cache: 'force-cache' });
  if (!res.ok) throw Object.assign(new Error('cercas'), { status: res.status });
  const gj = await res.json();
  for (const f of gj.features || []) {
   const ring = f.geometry?.coordinates?.[0]; if (!ring) continue;
   const planta = f.properties?.tipo === 'planta', nome = titulo(f.properties?.nome);
   const poly = L.polygon(ring.map(([lon, lat]) => [lat, lon]), planta
    ? { color: '#fff', weight: 2, opacity: .9, fill: false, interactive: false }
    : { color: '#fff', weight: 1, opacity: .55, fillColor: '#fff', fillOpacity: .04 });
   if (planta) { const b = poly.getBounds(), t = x => (x.getEast() - x.getWest()) * (x.getNorth() - x.getSouth()); if (!plantBounds || t(b) > t(plantBounds)) plantBounds = b; }
   else {
    poly.bindTooltip(nome, { sticky: true, className: 'tip' });
    poly.on('click', () => { state.area = nome; render(); });
    const b = poly.getBounds();
    state.areas.push({ nome, ring, size: (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth()) });
   }
   poly.addTo(fenceLayer);
  }
  if (plantBounds && state.first) map.fitBounds(plantBounds, { padding: [10, 10] });
 }

 // Abertura rápida (13/11): avaliações e ações vêm juntas (em paralelo) e a última cópia fica guardada
 // neste aparelho; ao abrir, a cópia aparece na hora e o banco atualiza por cima, sem tela vazia.
 const CACHE = 'arvores-cache-mapa-v1';
 let abriuHash = false;
 function aplicarDados(data, acoes, quando) {
  state.exemplo = !!data.exemplo;
  state.rows = D.readTable(data.table).map(r => ({ ...r, area: areaOf(r.geo) }));
  state.acoes = acoes;
  const hora = new Date(quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('status').textContent = (state.exemplo ? 'DADOS DE EXEMPLO · ' : '') + (state.rows.length ? 'Atualizado às ' + hora : 'Nenhuma avaliação registrada ainda');
  render();
  $('carregando').hidden = true;
  // link direto para uma árvore: /#ARV-00001
  const alvo = decodeURIComponent(location.hash.slice(1));
  if (alvo && !abriuHash && !state.sel) { const p = D.views(state.rows, { risks: [1, 2, 3, 4] }).points.find(x => x.id === alvo); if (p) { abriuHash = true; select(p, true); } }
 }
 const buscarTudo = () => Promise.all([buscarHistorico(), loadAcoes()]);
 function lerCache() {
  if (EXEMPLO) return null;
  try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c?.data?.table ? c : null; } catch { return null; }
 }
 function salvarCache(data, acoes) {
  if (EXEMPLO) return;
  try { const t = JSON.stringify({ data, acoes: acoes ? [...acoes] : null, quando: Date.now() }); if (t.length < 3e6) localStorage.setItem(CACHE, t); } catch { /* sem espaço */ }
 }
 async function loadHistory(pronto) {
  if (!state.rows.length) $('status').textContent = 'Carregando…';
  let data, acoes;
  try { [data, acoes] = await (pronto || buscarTudo()); }
  catch { $('carregando').hidden = true; $('status').textContent = state.rows.length ? 'Sem conexão · mostrando a última cópia' : navigator.onLine ? 'Banco indisponível agora' : 'Sem conexão'; return; }
  aplicarDados(data, acoes, Date.now());
  salvarCache(data, acoes);
 }
 // histórico: banco Supabase (público) ou dados de exemplo (?exemplo)
 const CFG = window.ARVORES_CONFIG || {};
 const EXEMPLO = new URLSearchParams(location.search).has('exemplo') || !CFG.supabaseUrl;
 const TIPO = { pessoas: 'Pessoas', fixo: 'Instalação / estrutura fixa alcançável', movel: 'Veículo / equipamento / bem móvel' };
 const SIT = { inicial: 'Exposição inicial', 'apos-controles': 'Exposição após os controles' };
 const CAB = ['ID da árvore', 'Unidade / setor / localização', 'Espécie', 'Componente avaliado', 'Local / alvo exposto', 'Tipo de alvo', 'Situação dos controles', 'Data e hora da inspeção', 'Geometria, alcance e ocupação', 'R registrado', 'Fotos', 'Código'];
 async function buscarHistorico() {
  if (EXEMPLO) { const r = await fetch('exemplo/historico.json', { cache: 'no-store' }); if (!r.ok) throw new Error('exemplo'); return r.json(); }
  const cedo = window.ARVORES_CEDO?.historico; if (window.ARVORES_CEDO) window.ARVORES_CEDO.historico = null;   // busca já começada (mapa/cedo.js), usada uma vez
  const lista = cedo ? await cedo : await (async () => {
   const r = await fetch(CFG.supabaseUrl + '/rest/v1/inspecoes_publicas?select=*&order=inspecionado_em.desc&limit=20000', { cache: 'no-store', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey } });
   if (!r.ok) throw new Error('banco ' + r.status);
   return r.json();
  })();
  const p2 = n => String(n).padStart(2, '0');
  const local = iso => { const d = new Date(iso); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const linhas = lista.map(x => [x.arvore_id, '', x.especie || '', x.componente, x.alvo, TIPO[x.tipo_alvo] || x.tipo_alvo, SIT[x.situacao_controles] || '',
   local(x.inspecionado_em), x.latitude != null ? 'Coordenadas da árvore (latitude, longitude): ' + x.latitude + '; ' + x.longitude : '', 'R' + x.r,
   (x.fotos || []).map(id => id.includes('/') ? CFG.supabaseUrl + '/storage/v1/object/public/fotos/' + id.split('/').map(encodeURIComponent).join('/') + '_mini.jpg' : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1000').join(';'), x.id]);
  return { table: [CAB, ...linhas], exemplo: false };
 }
 function gate(code) {
  $('gate').hidden = false;
  if (code === 403) { $('gateTitle').textContent = 'Acesso não liberado'; $('gateText').textContent = 'Sua conta entrou, mas não está na lista da equipe autorizada. Peça a liberação ao responsável.'; $('gateLink').hidden = true; }
  $('status').textContent = '';
 }

 // ---------- filtros (botão do mapa e aba) ----------
 function filterControls() {
  const seg = el('div', { class: 'fseg', role: 'group', 'aria-label': 'Criticidade' }, el('button', { type: 'button', 'data-r': 'all' }, 'Todas as criticidades'));
  for (const r of [4, 3, 2, 1]) seg.append(el('button', { type: 'button', 'data-r': String(r) }, el('i', { class: 'dot r' + r }), 'R' + r + ' ' + NOMES[r], el('b', { 'data-n': String(r) }, '0')));
  seg.addEventListener('click', e => {
   const b = e.target.closest('button'); if (!b) return;
   if (b.dataset.r === 'all') state.risks = null;
   else {
    const r = Number(b.dataset.r); state.risks = new Set(state.risks || []);
    state.risks.has(r) ? state.risks.delete(r) : state.risks.add(r);
    if (!state.risks.size || state.risks.size === 4) state.risks = null;
   }
   render();
  });
  const area = el('select', { class: 'fArea', 'aria-label': 'Área' });
  area.addEventListener('change', () => { state.area = area.value; render(); });
  const per = el('select', { class: 'fPeriod', 'aria-label': 'Período' }, ...PERIODOS.map(([v, t]) => el('option', { value: v }, t)));
  per.addEventListener('change', () => { state.period = per.value; render(); });
  const limpar = el('button', { type: 'button', class: 'link', on: () => { state.risks = null; state.area = ''; state.period = '90'; state.q = ''; $('search').value = ''; render(); } }, 'Limpar filtros');
  return el('div', { class: 'fbox' }, el('div', { class: 'flabel' }, 'Criticidade'), seg, el('div', { class: 'flabel' }, 'Área da usina'), area, el('div', { class: 'flabel' }, 'Período'), per, limpar);
 }
 $('filterPop').append(filterControls());
 $('filterTab').append(filterControls());
 $('filterBtn').addEventListener('click', e => { e.stopPropagation(); const open = $('filterPop').hidden; $('filterPop').hidden = !open; $('filterBtn').setAttribute('aria-expanded', String(open)); });
 $('filterPop').addEventListener('click', e => e.stopPropagation());
 document.addEventListener('click', () => { $('filterPop').hidden = true; $('filterBtn').setAttribute('aria-expanded', 'false'); });

 function syncFilters(n) {
  const nomes = [...new Set(state.rows.map(r => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (state.area && !nomes.includes(state.area)) nomes.unshift(state.area);
  for (const s of document.querySelectorAll('.fArea')) {
   s.replaceChildren(el('option', { value: '' }, 'Todas as áreas'), ...nomes.map(x => el('option', { value: x }, x)));
   s.value = state.area;
  }
  for (const s of document.querySelectorAll('.fPeriod')) s.value = state.period;
  for (const b of document.querySelectorAll('.fseg button')) b.setAttribute('aria-pressed', String(b.dataset.r === 'all' ? !state.risks : !!state.risks?.has(Number(b.dataset.r))));
  for (const b of document.querySelectorAll('[data-n]')) b.textContent = n[b.dataset.n];
  const ativos = (state.risks ? 1 : 0) + (state.area ? 1 : 0) + (state.period !== '90' ? 1 : 0);
  $('filterBadge').textContent = ativos; $('filterBadge').hidden = !ativos;
 }

 // ---------- abas ----------
 const tabs = ['prioridades', 'registros', 'filtros'];
 let abaAtual = 'prioridades';
 function showTab(t) {
  abaAtual = t;
  const ficha = !!state.sel;
  $('tabsBar').hidden = ficha;
  for (const x of tabs) { $('t-' + x).setAttribute('aria-selected', String(x === t)); $('p-' + x).hidden = ficha || x !== t; }
 }
 for (const x of tabs) $('t-' + x).addEventListener('click', () => showTab(x));
 $('search').addEventListener('input', () => { state.q = $('search').value; state.limit = 60; render(); });
 $('moreRecords').addEventListener('click', () => { state.limit += 60; render(); });

 // ---------- desenho ----------
 function render() {
  const f = { risks: [1, 2, 3, 4], tests: false };
  if (state.period) f.start = new Date(Date.now() - Number(state.period) * 864e5).toISOString().slice(0, 10);
  const v = D.views(state.rows, f), byArea = r => !state.area || r.area === state.area, byRisk = r => !state.risks || state.risks.has(r.risk);
  const all = v.points.filter(p => byArea(p) && !suprimida(p.id)), missing = v.missing.filter(byArea);
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of all) if (n[p.risk] !== undefined) n[p.risk]++;
  const pts = all.filter(byRisk);
  syncFilters(n);

  pointLayer.clearLayers();
  for (const p of [...pts].sort((a, b) => a.risk - b.risk)) {
   const ll = [p.geo.lat, p.geo.lon], r = p.risk || 1, sel = state.sel === p.tree;
   if (r === 4) L.circleMarker(ll, { radius: 15, stroke: false, fillColor: COR[4], fillOpacity: .28, interactive: false }).addTo(pointLayer);
   const m = L.circleMarker(ll, { radius: r >= 3 ? 8 : 6.5, color: '#fff', weight: sel ? 3.2 : 1.6, fillColor: COR[r] || '#888', fillOpacity: 1 });
   const f1 = fotosDe(p.tree)[0];
   m.bindTooltip((f1 ? '<img class="tipimg" src="' + esc(f1.url) + '" alt="">' : '') + esc(p.id) + ' · R' + p.risk + ' ' + (NOMES[p.risk] || '') + '<br>' + esc(p.area || '') + ' · ' + dataBR(p.stamp), { className: 'tip', direction: 'top', offset: [0, -6] });
   m.on('click', () => select(p, true));
   m.addTo(pointLayer);
  }
  if (state.first && pts.length) { map.fitBounds(L.latLngBounds(pts.map(p => [p.geo.lat, p.geo.lon])), { padding: [60, 60], maxZoom: 16 }); state.first = false; }

  $('nMissing').textContent = missing.length;

  const regs = v.scoped.filter(r => byArea(r) && byRisk(r)).sort((a, b) => (b.stamp || '').localeCompare(a.stamp || ''));
  const crit = pts.filter(p => p.risk >= 3).sort((a, b) => b.risk - a.risk || (b.stamp || '').localeCompare(a.stamp || '')).slice(0, 40);
  $('attention').replaceChildren(...crit.map(p => el('li', {}, el('button', { type: 'button', on: () => select(p, true) },
   (() => { const f = fotosDe(p.tree)[0]; return f ? thumb(f.url) : el('span', { class: 'th vazio-th' }); })(), el('span', { class: 'txt' }, el('strong', {}, p.id), el('small', {}, (p.area || '—') + ' · ' + dataBR(p.stamp))), riskTag(p.risk)))));
  $('attentionEmpty').hidden = crit.length > 0;
  $('prioCount').textContent = pts.filter(p => p.risk >= 3).length;

  // aba Registros
  const q = norm(state.q);
  const lista = q ? regs.filter(r => norm([r.id, r.area, r.target, r.component, r.species].join(' ')).includes(q)) : regs;
  $('regCount').textContent = lista.length;
  const ptsByTree = new Map(all.map(p => [p.tree, p]));
  $('records').replaceChildren(...lista.slice(0, state.limit).map(r => {
   const p = ptsByTree.get(r.tree);
   const sup = suprimida(r.id);
   return el('li', {}, el('button', { type: 'button', disabled: p ? false : 'disabled', title: p ? 'Ver no mapa' : sup ? 'Árvore suprimida (fora do mapa)' : 'Sem coordenadas', on: () => p && select(p, true) },
    r.photos?.[0] ? thumb(r.photos[0]) : el('span', { class: 'th vazio-th' }), el('span', { class: 'txt' }, el('strong', {}, r.id), el('small', {}, [sup ? 'SUPRIMIDA' : '', r.area || 'Sem coordenadas', r.component, dataBR(r.stamp)].filter(Boolean).join(' · '))), riskTag(r.risk)));
  }));
  $('moreRecords').hidden = lista.length <= state.limit;
  $('recordsEmpty').hidden = lista.length > 0;

  // aba Filtros
  $('missingBox').hidden = !missing.length;
  $('missing').replaceChildren(...missing.slice(0, 50).map(r => el('li', {}, r.id + ' · ' + (r.target || '—') + ' · ' + dataBR(r.stamp))));

  if (state.sel) { const p = all.find(x => x.tree === state.sel); if (p) ficha(p); else closeSel(); }
 }

 function galeria(tree) {
  const fotos = fotosDe(tree);
  if (!fotos.length) return el('div', { class: 'semfoto' }, 'Sem fotos nesta árvore');
  const g = el('div', { class: 'gal' });
  const big = el('button', { type: 'button', class: 'big', 'aria-label': 'Ampliar foto', on: () => abrir(fotos, 0) }, el('img', { src: fotos[0].url, alt: 'Foto da árvore' }), el('span', { class: 'cnt' }, fotos.length + (fotos.length > 1 ? ' fotos' : ' foto')));
  g.append(big);
  if (fotos.length > 1) g.append(el('div', { class: 'mini-fotos' }, ...fotos.slice(1, 5).map((f, i) => el('button', { type: 'button', 'aria-label': 'Ampliar foto ' + (i + 2), on: () => abrir(fotos, i + 1) }, el('img', { src: f.url, alt: '', loading: 'lazy' })))));
  return g;
 }
 let lb = { fotos: [], i: 0 };
 function abrir(fotos, i) { lb = { fotos, i }; mostrarLb(); $('lightbox').showModal(); }
 function mostrarLb() {
  const f = lb.fotos[lb.i];
  $('lbImg').src = f.url.replace(/_mini\.jpg$/, '.jpg');   // ampliada: foto inteira
  $('lbInfo').textContent = 'Foto ' + (lb.i + 1) + ' de ' + lb.fotos.length + ' · inspeção de ' + f.data;
  $('lbPrev').hidden = $('lbNext').hidden = lb.fotos.length < 2;
 }
 $('lbPrev').addEventListener('click', () => { lb.i = (lb.i - 1 + lb.fotos.length) % lb.fotos.length; mostrarLb(); });
 $('lbNext').addEventListener('click', () => { lb.i = (lb.i + 1) % lb.fotos.length; mostrarLb(); });
 $('lbClose').addEventListener('click', () => $('lightbox').close());
 $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
 $('lightbox').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') $('lbPrev').click(); if (e.key === 'ArrowRight') $('lbNext').click(); });

 function select(p, fly) {
  state.sel = p.tree;
  $('filterPop').hidden = true; $('filterBtn').setAttribute('aria-expanded', 'false');
  window.dispatchEvent(new CustomEvent('arvore-aberta'));
  if (fly) {
   const z = Math.max(map.getZoom(), 17);
   let alvo = L.latLng(p.geo.lat, p.geo.lon);
   // celular: a ficha cobre a metade de baixo, então a árvore fica no centro da parte visível
   map.flyTo(alvo, z, { duration: .6 });
  }
  render();
 }
 // ação da árvore (SQL 04): aberta -> botão Dar baixa; com baixa -> o que foi feito
 const TIPO_ACAO = { poda: 'Poda', poda_drastica: 'Poda drástica', supressao: 'Supressão' };
 function blocoAcao(p) {
  const ex = state.exemplo ? '?exemplo' : '', id = encodeURIComponent(p.id);
  const a = state.acoes ? state.acoes.get(p.id) : null;
  const reavaliar = el('a', { class: a?.status === 'concluida' ? 'cta' : 'cta sec', href: 'avaliar/?arvore=' + id }, 'Reavaliar');
  if (a?.status === 'concluida') {
   const d = a.concluida ? new Date(a.concluida).toLocaleDateString('pt-BR') : '';
   return el('div', { class: 'acoes' }, el('p', { class: 'acao-feita' }, el('b', {}, 'Ação com baixa: ' + (TIPO_ACAO[a.tipo] || '')), ' em ' + d + (a.responsavel ? ' por ' + a.responsavel : '')),
    el('a', { class: 'cta sec', href: 'acoes/?arvore=' + id + (ex ? '&exemplo' : '') }, 'Ver ação'), reavaliar);
  }
  if (a?.status === 'aberta' || state.exemplo) return el('div', { class: 'acoes' }, el('p', { class: 'acao-aberta' }, el('b', {}, 'Ação aberta'), ' · falta dar baixa (poda, poda drástica ou supressão)'),
   el('a', { class: 'cta', href: 'acoes/?arvore=' + id + (ex ? '&exemplo' : '') }, 'Dar baixa na ação'), reavaliar);
  return el('div', { class: 'acoes' }, el('a', { class: 'cta', href: 'avaliar/?arvore=' + id }, 'Reavaliar esta árvore'));
 }
 function suprimida(id) { const a = state.acoes?.get(id); return a?.status === 'concluida' && a.tipo === 'supressao'; }

 // ---------- excluir uma avaliação (SQL 05) ----------
 let excluindo = null;
 function pedirExclusao(r) {
  excluindo = r;
  const f = $('exForm'); f.reset();
  try { f.elements.responsavel.value = localStorage.getItem('arvores-responsavel-baixa') || ''; } catch { /* nada */ }
  $('exTexto').textContent = 'Árvore ' + r.id + ' · avaliação de ' + dataBR(r.stamp) + ' · R' + r.risk + (r.component ? ' · ' + r.component : '');
  $('exErro').hidden = true; $('exOk').disabled = false; $('exOk').textContent = 'Excluir';
  $('exDlg').showModal();
 }
 $('exCancelar').addEventListener('click', () => $('exDlg').close());
 $('exForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = $('exForm'), motivo = f.elements.motivo.value.trim(), resp = f.elements.responsavel.value.trim();
  const falha = t => { $('exErro').textContent = t; $('exErro').hidden = false; };
  if (motivo.length < 3) return falha('Escreva o motivo da exclusão.');
  if (resp.length < 3) return falha('Informe quem está excluindo.');
  try { localStorage.setItem('arvores-responsavel-baixa', resp); } catch { /* nada */ }
  $('exOk').disabled = true; $('exOk').textContent = 'Excluindo…';
  try {
   const r = await fetch(CFG.supabaseUrl + '/rest/v1/rpc/excluir_inspecao', { method: 'POST', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: excluindo.insp, p_motivo: motivo, p_responsavel: resp }) });
   const j = await r.json().catch(() => null);
   if (!r.ok) throw new Error(j?.message || 'Erro ' + r.status);
  } catch (x) { $('exOk').disabled = false; $('exOk').textContent = 'Excluir'; return falha(navigator.onLine ? 'Não foi possível excluir: ' + x.message : 'Sem conexão. Tente de novo com internet.'); }
  $('exDlg').close();
  await loadHistory();
 });

 async function loadAcoes() {   // devolve o mapa árvore -> ação (ou null)
  if (EXEMPLO) return null;
  try {
   const cedo = window.ARVORES_CEDO?.acoes; if (window.ARVORES_CEDO) window.ARVORES_CEDO.acoes = null;
   const lista = cedo ? await cedo : await (async () => {
    const r = await fetch(CFG.supabaseUrl + '/rest/v1/acoes_publicas?select=arvore_id,status,tipo,concluida_em,responsavel,inspecionado_em&status=neq.substituida&order=inspecionado_em.desc&limit=20000', { cache: 'no-store', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey } });
    if (!r.ok) throw new Error('banco ' + r.status);
    return r.json();
   })();
   const m = new Map();
   for (const x of lista) if (!m.has(x.arvore_id)) m.set(x.arvore_id, { status: x.status, tipo: x.tipo, concluida: x.concluida_em, responsavel: x.responsavel });
   return m;
  } catch { return null; }   // sem ações: fica só o Reavaliar
 }
 function closeSel() { state.sel = null; $('sel').hidden = true; showTab(abaAtual); window.dispatchEvent(new CustomEvent('arvore-fechada')); }
 function ficha(p) {
  const hist = state.rows.filter(r => r.tree === p.tree).sort((a, b) => (b.stamp || '').localeCompare(a.stamp || ''));
  const dl = el('table', { class: 'dados' }, el('tbody', {}, ...[['Área', p.area], ['Local / alvo', p.target], ['Componente', p.component], ['Espécie', p.species], ['Tipo de alvo', p.type], ['Última inspeção', dataBR(p.stamp)], ['Inspeções', String(hist.length)]]
   .map(([k, v]) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, v || '—')))));
  $('sel').replaceChildren(...[
   el('div', { class: 'h' }, el('b', {}, p.id), riskTag(p.risk), el('button', { class: 'x', type: 'button', 'aria-label': 'Fechar', on: () => { closeSel(); render(); } }, '×')),
   galeria(p.tree),
   dl,
   el('div', { class: 'hist' }, el('div', { class: 'hist-t' }, el('b', {}, 'Avaliações desta árvore (' + hist.length + ')')),
    ...hist.map(r => el('div', {}, el('span', {}, dataBR(r.stamp) + ' · ' + (r.component || '')), el('span', { class: 'hist-d' }, 'R' + r.risk,
     r.insp ? el('button', { type: 'button', class: 'excluir', 'aria-label': 'Excluir a avaliação de ' + dataBR(r.stamp), on: () => pedirExclusao(r) }, 'Excluir') : null)))),
   blocoAcao(p)].filter(Boolean));
  $('sel').hidden = false;
  showTab(abaAtual);
 }


 // modo exemplo continua ao trocar de tela
 if (new URLSearchParams(location.search).has('exemplo')) for (const a of document.querySelectorAll('.nav a, .logo')) { const h = a.getAttribute('href'); if (h && !h.includes('?')) a.setAttribute('href', h + '?exemplo'); }
 window.TreeMapaRef = map;
 window.TreeMapaUI = { aba: showTab, fecharFicha: () => { if (state.sel) { closeSel(); render(); } } };
 const rede = buscarTudo(); rede.catch(() => { /* tratado no loadHistory */ });   // começa a buscar já, junto com as cercas
 loadFences().catch(e => { if (e.status === 401 || e.status === 403) gate(e.status); }).finally(() => {
  const c = lerCache();
  if (c) aplicarDados(c.data, c.acoes ? new Map(c.acoes) : null, c.quando);
  loadHistory(rede);
 });
 setInterval(() => { if (!document.hidden && $('gate').hidden) loadHistory(); }, 5 * 60 * 1000);
})();
