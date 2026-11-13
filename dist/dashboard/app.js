'use strict';
// Dashboard (12/11/2026): os gráficos que saíram do painel lateral do mapa.
// Mesmos dados do mapa: banco Supabase (inspecoes_publicas) ou exemplo (?exemplo).
(function () {
 const $ = id => document.getElementById(id);
 const CFG = window.ARVORES_CONFIG || {};
 const EXEMPLO = new URLSearchParams(location.search).has('exemplo') || !CFG.supabaseUrl;
 const NOMES = { 1: 'Baixa', 2: 'Moderada', 3: 'Alta', 4: 'Crítica' };
 const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
 const TIPO = { 'Pessoas': 'pessoas', 'Instalação / estrutura fixa alcançável': 'fixo', 'Veículo / equipamento / bem móvel': 'movel' };
 let dados = [], areas = [], acoes = null;

 function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
  for (const k of kids) if (k != null) e.append(k);
  return e;
 }
 const titulo = s => String(s || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('pt-BR'));
 const dataBR = d => d ? d.toLocaleDateString('pt-BR') : '—';
 const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
 const risco = r => el('span', { class: 'risk' }, el('i', { class: 'dot r' + r }), 'R' + r + ' · ' + NOMES[r]);

 // ---------- áreas da usina ----------
 function dentro(lon, lat, ring) { let ok = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok; } return ok; }
 function areaDe(lat, lon) {
  if (lat == null) return '';
  let b = null; for (const a of areas) if (dentro(lon, lat, a.ring) && (!b || a.size < b.size)) b = a;
  return b ? b.nome : 'Fora das áreas';
 }
 async function carregarAreas() {
  const r = await fetch('../dados/cercas.geojson', { cache: 'force-cache' }); const g = await r.json();
  areas = g.features.filter(f => f.properties?.tipo !== 'planta' && f.geometry?.coordinates?.[0]).map(f => {
   const ring = f.geometry.coordinates[0], xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
   return { nome: titulo(f.properties.nome), ring, size: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) };
  });
 }

 // ---------- dados ----------
 async function carregar() {
  if (EXEMPLO) {
   const t = (await (await fetch('../exemplo/historico.json', { cache: 'no-store' })).json()).table.slice(1);
   return t.map(r => {
    const m = String(r[8]).match(/(-?\d+\.\d+);\s*(-?\d+\.\d+)/), [d, mo, y] = String(r[7]).slice(0, 10).split('/'), [h, mi] = String(r[7]).slice(11, 16).split(':');
    return { id: r[0], quando: new Date(+y, mo - 1, +d, +h || 0, +mi || 0), r: +String(r[9]).slice(1), f: null, comp: r[3], alvo: r[4], tipo: TIPO[r[5]] || r[5], lat: m ? +m[1] : null, lon: m ? +m[2] : null };
   });
  }
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/inspecoes_publicas?select=arvore_id,inspecionado_em,r,f,componente,alvo,tipo_alvo,latitude,longitude&order=inspecionado_em.desc&limit=20000',
   { cache: 'no-store', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey } });
  if (!r.ok) throw new Error('banco ' + r.status);
  return (await r.json()).map(x => ({ id: x.arvore_id, quando: new Date(x.inspecionado_em), r: x.r, f: x.f, comp: x.componente, alvo: x.alvo, tipo: x.tipo_alvo, lat: x.latitude, lon: x.longitude }));
 }

 // ações (SQL 04). Exemplo: 1 ação aberta por árvore (a última avaliação).
 async function carregarAcoes() {
  if (EXEMPLO) {
   const ult = new Map(); for (const x of dados) { const a = ult.get(x.id); if (!a || x.quando > a.quando) ult.set(x.id, x); }
   return [...ult.values()].map(x => ({ arvore: x.id, status: 'aberta', tipo: null, concluida: null, criada: x.quando, avaliada: x.quando, r: x.r, area: x.area, lat: x.lat }));
  }
  const r = await fetch(CFG.supabaseUrl + '/rest/v1/acoes_publicas?select=arvore_id,status,tipo,concluida_em,criado_em,inspecionado_em,r,latitude,longitude&status=neq.substituida&limit=20000',
   { cache: 'no-store', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey } });
  if (!r.ok) return null;
  return (await r.json()).map(x => ({ arvore: x.arvore_id, status: x.status, tipo: x.tipo, concluida: x.concluida_em ? new Date(x.concluida_em) : null,
   criada: new Date(x.criado_em), avaliada: new Date(x.inspecionado_em), r: x.r, lat: x.latitude, area: areaDe(x.latitude, x.longitude) }));
 }
 function renderAcoes(inicio, area) {
  $('acoesAviso').hidden = !!acoes;
  const lista = (acoes || []).filter(a => !area || a.area === area);
  const abertas = lista.filter(a => a.status === 'aberta');
  const baixas = lista.filter(a => a.status === 'concluida' && (!inicio || a.concluida >= inicio));
  const t = { poda: 0, poda_drastica: 0, supressao: 0 }; for (const a of baixas) if (t[a.tipo] !== undefined) t[a.tipo]++;
  const crit = abertas.filter(a => a.r >= 3).length;
  $('aAbertas').textContent = abertas.length;
  $('aAbertasSub').textContent = crit ? crit + ' delas R3 ou R4' : 'esperando baixa';
  $('aBaixas').textContent = baixas.length;
  $('aBaixasSub').textContent = $('period').selectedOptions[0].textContent.toLowerCase();
  $('aPoda').textContent = t.poda; $('aPodaP').textContent = pct(t.poda, baixas.length) + ' das baixas';
  $('aDrastica').textContent = t.poda_drastica; $('aDrasticaP').textContent = pct(t.poda_drastica, baixas.length) + ' das baixas';
  $('aSupressao').textContent = t.supressao; $('aSupressaoP').textContent = pct(t.supressao, baixas.length) + ' das baixas';
  const hoje = Date.now(), ex = EXEMPLO ? '&exemplo' : '';
  const tab = abertas.sort((a, b) => (b.r || 0) - (a.r || 0) || a.criada - b.criada).slice(0, 50);
  $('tabAcoes').replaceChildren(...tab.map(a => {
   const dias = Math.max(0, Math.floor((hoje - a.criada) / 864e5));
   return el('tr', {}, el('td', { class: 'id' }, a.arvore), el('td', {}, a.r ? risco(a.r) : '—'), el('td', {}, a.area || 'Sem coordenadas'), el('td', {}, dataBR(a.avaliada)),
    el('td', { class: dias >= 7 ? 'atraso' : '' }, dias === 0 ? 'hoje' : dias === 1 ? '1 dia' : dias + ' dias'),
    el('td', {}, el('a', { href: '../acoes/?arvore=' + encodeURIComponent(a.arvore) + ex }, 'Dar baixa')));
  }));
  $('tabAcoesVazia').hidden = tab.length > 0;
 }

 // ---------- desenho ----------
 function hbars(id, itens, cores) {
  const max = Math.max(1, ...itens.map(i => i.total));
  $(id).replaceChildren(...itens.map(i => {
   const barra = el('span', { class: 'b' });
   for (const [k, v] of Object.entries(i.partes || { x: i.total })) {
    if (!v) continue;
    const seg = el('i', { class: cores ? cores[k] : 'bar-bg', title: (cores ? 'R' + k + ': ' : '') + v });
    seg.style.flex = String(v); barra.append(seg);
   }
   barra.style.width = Math.max(4, i.total / max * 100) + '%';
   return el('li', { title: i.nome + ': ' + i.total }, el('span', { class: 'n' }, i.nome), el('span', { class: 't' }, barra), el('b', {}, String(i.total)));
  }));
 }
 function contar(lista, chave) {
  const m = new Map(); for (const x of lista) { const k = x[chave] || '—'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 7).map(([nome, total]) => ({ nome, total }));
 }

 function render() {
  const dias = Number($('period').value), area = $('area').value;
  const inicio = dias ? new Date(Date.now() - dias * 864e5) : null;
  const insp = dados.filter(x => (!inicio || x.quando >= inicio) && (!area || x.area === area));
  const ult = new Map(); for (const x of insp) { const a = ult.get(x.id); if (!a || x.quando > a.quando) ult.set(x.id, x); }
  const arv = [...ult.values()], tot = arv.length;
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 }; for (const a of arv) if (n[a.r] !== undefined) n[a.r]++;

  $('sub').textContent = (area || 'Todas as áreas') + ' · ' + $('period').selectedOptions[0].textContent.toLowerCase();
  $('kArv').textContent = tot; $('kInsp').textContent = insp.length + (insp.length === 1 ? ' inspeção' : ' inspeções');
  $('kR4').textContent = n[4]; $('kR4p').textContent = pct(n[4], tot) + ' das árvores';
  $('kR3').textContent = n[3]; $('kR3p').textContent = pct(n[3], tot) + ' das árvores';
  const temF = arv.some(a => a.f != null);
  $('kF4').textContent = temF ? arv.filter(a => a.f === 4).length : '—';
  $('kSem').textContent = arv.filter(a => a.lat == null).length;

  const semGeo = arv.filter(a => a.lat == null).length;
  $('distSub').textContent = tot + (tot === 1 ? ' árvore' : ' árvores') + ', pela última inspeção de cada uma' + (semGeo ? ' (' + semGeo + ' sem coordenadas, fora do mapa)' : '');
  $('stack').replaceChildren(...[4, 3, 2, 1].filter(r => n[r]).map(r => { const i = el('i', { class: 'r' + r + '-bg', title: 'R' + r + ' ' + NOMES[r] + ': ' + n[r] }); i.style.flex = String(n[r]); return i; }));
  $('leg').replaceChildren(...[4, 3, 2, 1].map(r => el('div', {}, el('b', {}, String(n[r])), el('span', {}, el('i', { class: 'dot r' + r }), 'R' + r + ' ' + NOMES[r]), el('small', {}, pct(n[r], tot)))));

  // inspeções por mês
  const qtd = dias === 30 ? 3 : dias === 90 ? 4 : 12, hoje = new Date(), meses = [];
  for (let i = qtd - 1; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); meses.push([d.getFullYear() * 12 + d.getMonth(), MES[d.getMonth()] + (d.getMonth() === 0 || i === qtd - 1 ? '/' + String(d.getFullYear()).slice(2) : '')]); }
  const cont = new Map(meses.map(([k]) => [k, 0]));
  for (const x of insp) { const k = x.quando.getFullYear() * 12 + x.quando.getMonth(); if (cont.has(k)) cont.set(k, cont.get(k) + 1); }
  const max = Math.max(1, ...cont.values());
  $('months').replaceChildren(...meses.map(([k, nome]) => { const v = cont.get(k), b = el('i', { title: nome + ': ' + v + ' inspeções' }); b.style.height = (v / max * 100) + '%'; return el('div', { class: 'c' }, el('em', {}, v ? String(v) : ''), b); }));
  $('monthsLbl').replaceChildren(...meses.map(([, nome]) => el('span', {}, nome)));

  // áreas com R3 e R4
  const porArea = new Map();
  for (const a of arv) if (a.r >= 3) { const c = porArea.get(a.area) || { 4: 0, 3: 0 }; c[a.r]++; porArea.set(a.area, c); }
  const listaAreas = [...porArea.entries()].map(([nome, c]) => ({ nome, total: c[3] + c[4], partes: { 4: c[4], 3: c[3] } })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)).slice(0, 7);
  hbars('areas', listaAreas, { 4: 'r4-bg', 3: 'r3-bg' });
  $('areasVazio').hidden = listaAreas.length > 0;
  hbars('comps', contar(arv, 'comp'));
  hbars('alvos', contar(arv, 'alvo'));

  // tabela
  const crit = arv.filter(a => a.r >= 3).sort((a, b) => b.r - a.r || b.quando - a.quando).slice(0, 50);
  $('tabela').replaceChildren(...crit.map(a => el('tr', {},
   el('td', { class: 'id' }, a.id), el('td', {}, risco(a.r)), el('td', {}, a.area || 'Sem coordenadas'), el('td', {}, a.comp || '—'), el('td', {}, dataBR(a.quando)),
   el('td', {}, a.lat != null ? el('a', { href: '../' + (EXEMPLO ? '?exemplo' : '') + '#' + encodeURIComponent(a.id) }, 'Ver no mapa') : ''))));
  $('tabelaVazia').hidden = crit.length > 0;
  renderAcoes(inicio, area);
 }

 async function iniciar() {
  try {
   await carregarAreas();
   dados = (await carregar()).map(x => ({ ...x, area: areaDe(x.lat, x.lon) }));
   acoes = await carregarAcoes().catch(() => null);
   const nomes = [...new Set(dados.map(x => x.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
   $('area').append(...nomes.map(n => el('option', { value: n }, n)));
   const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
   $('status').textContent = (EXEMPLO ? 'DADOS DE EXEMPLO · ' : '') + (dados.length ? 'Atualizado às ' + hora : 'Nenhuma avaliação registrada ainda');
   render();
  } catch { $('status').textContent = navigator.onLine ? 'Banco indisponível agora' : 'Sem conexão'; }
 }

 // modo exemplo continua ao trocar de tela
 if (new URLSearchParams(location.search).has('exemplo')) for (const a of document.querySelectorAll('.nav a, .logo')) { const h = a.getAttribute('href'); if (h && !h.includes('?')) a.setAttribute('href', h + '?exemplo'); }
 $('period').addEventListener('change', render);
 $('area').addEventListener('change', render);
 iniciar();
})();
