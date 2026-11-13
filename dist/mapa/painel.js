'use strict';
// Painel lateral (12/11/2026).
// Computador: arraste a borda esquerda para alargar/estreitar; botão › recolhe; botão "Painel" no mapa reabre.
// Celular: o mapa fica em tela cheia (só mapa + Filtros). O menu ☰ abre Prioridades ou Registros
//   em tela própria; tocar numa árvore sobe só a ficha por baixo (arrastar: metade ↔ quase cheia; para baixo fecha).
(function () {
 const $ = id => document.getElementById(id);
 const main = $('main'), side = $('side'), root = document.documentElement;
 const celular = matchMedia('(max-width: 768px)');
 const CHAVE = 'arvores-painel-v1';
 const TITULOS = { prioridades: 'Prioridades', registros: 'Registros', filtros: 'Filtros' };
 let estado = { largura: 380, recolhido: false };
 try { Object.assign(estado, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch { /* padrão */ }
 const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify({ largura: estado.largura, recolhido: estado.recolhido })); } catch { /* sem espaço */ } };
 const ui = () => window.TreeMapaUI || {};
 let ajuste;
 const refazerMapa = () => { clearTimeout(ajuste); ajuste = setTimeout(() => window.TreeMapaRef?.invalidateSize({ pan: false }), 240); };

 // ---------- computador ----------
 const limitar = w => Math.round(Math.min(Math.max(w, 300), Math.min(760, window.innerWidth * 0.62)));
 function aplicarComputador() {
  side.dataset.modo = '';
  root.style.setProperty('--side-w', limitar(estado.largura) + 'px');
  main.classList.toggle('recolhido', estado.recolhido);
  $('expandBtn').hidden = !estado.recolhido;
  refazerMapa();
 }
 $('resizer').addEventListener('pointerdown', e => {
  if (celular.matches) return;
  e.preventDefault(); $('resizer').setPointerCapture(e.pointerId); document.body.classList.add('arrastando');
  const mover = ev => { estado.largura = limitar(window.innerWidth - ev.clientX); root.style.setProperty('--side-w', estado.largura + 'px'); };
  const soltar = () => { $('resizer').removeEventListener('pointermove', mover); document.body.classList.remove('arrastando'); salvar(); refazerMapa(); };
  $('resizer').addEventListener('pointermove', mover);
  $('resizer').addEventListener('pointerup', soltar, { once: true });
  $('resizer').addEventListener('pointercancel', soltar, { once: true });
 });
 $('resizer').addEventListener('dblclick', () => { estado.largura = 380; salvar(); aplicarComputador(); });
 $('collapseBtn').addEventListener('click', () => { if (!celular.matches) { estado.recolhido = true; salvar(); aplicarComputador(); } });
 $('expandBtn').addEventListener('click', () => { estado.recolhido = false; salvar(); aplicarComputador(); });

 // ---------- celular ----------
 // modo: 'mapa' (painel escondido) | 'lista' (Prioridades/Registros em tela cheia) | 'ficha' (ficha por baixo do mapa)
 let modo = 'mapa', altura = 'meia', antesDaFicha = null;
 const alturas = () => ({ meia: Math.round(window.innerHeight * 0.5), cheia: Math.round(window.innerHeight * 0.88) });
 function aplicarCelular(px) {
  side.dataset.modo = modo;
  const h = modo === 'ficha' ? (px ?? alturas()[altura]) : 0;
  root.style.setProperty('--sheet-h', h + 'px');
  refazerMapa();
 }
 function abrirLista(aba) {
  if (!celular.matches) { ui().aba?.(aba); if (estado.recolhido) { estado.recolhido = false; salvar(); aplicarComputador(); } return; }
  antesDaFicha = null;
  ui().fecharFicha?.();
  ui().aba?.(aba);
  $('sideTitulo').textContent = TITULOS[aba] || '';
  modo = 'lista'; aplicarCelular();
  window.TreeMenu?.marcar(aba);
  $('side').querySelector('.side-body').scrollTop = 0;
 }
 function soMapa() {
  antesDaFicha = null;
  ui().fecharFicha?.();
  modo = 'mapa'; aplicarCelular();
  window.TreeMenu?.marcar('mapa');
 }
 $('sideVoltar').addEventListener('click', soMapa);

 // ficha: sobe por baixo; arrastar a alça muda a altura; puxar bem para baixo fecha
 window.addEventListener('arvore-aberta', () => {
  if (celular.matches) { if (modo === 'lista') antesDaFicha = 'lista'; modo = 'ficha'; altura = 'meia'; aplicarCelular(); }
  else if (estado.recolhido) { estado.recolhido = false; salvar(); aplicarComputador(); }
 });
 window.addEventListener('arvore-fechada', () => {
  if (!celular.matches || modo !== 'ficha') return;
  modo = antesDaFicha || 'mapa'; antesDaFicha = null; aplicarCelular();
 });
 $('sheetHandle').addEventListener('pointerdown', e => {
  if (!celular.matches || modo !== 'ficha') return;
  e.preventDefault(); $('sheetHandle').setPointerCapture(e.pointerId);
  const y0 = e.clientY, h0 = side.getBoundingClientRect().height, a = alturas();
  let h = h0, moveu = false;
  const mover = ev => { moveu = moveu || Math.abs(ev.clientY - y0) > 4; h = Math.min(Math.max(h0 + (y0 - ev.clientY), 80), a.cheia); side.classList.add('sem-animacao'); aplicarCelular(h); };
  const soltar = () => {
   $('sheetHandle').removeEventListener('pointermove', mover); side.classList.remove('sem-animacao');
   if (!moveu) { altura = altura === 'meia' ? 'cheia' : 'meia'; aplicarCelular(); return; }
   if (h < a.meia * 0.6) { ui().fecharFicha?.(); return; }
   altura = Math.abs(h - a.meia) < Math.abs(h - a.cheia) ? 'meia' : 'cheia'; aplicarCelular();
  };
  $('sheetHandle').addEventListener('pointermove', mover);
  $('sheetHandle').addEventListener('pointerup', soltar, { once: true });
  $('sheetHandle').addEventListener('pointercancel', soltar, { once: true });
 });

 function aplicar() {
  if (celular.matches) { main.classList.remove('recolhido'); $('expandBtn').hidden = true; aplicarCelular(); }
  else { root.style.removeProperty('--sheet-h'); aplicarComputador(); }
 }
 celular.addEventListener('change', aplicar);
 window.addEventListener('resize', () => { if (celular.matches) aplicarCelular(); else aplicarComputador(); });
 aplicar();

 // chegou pelo menu de outra tela: ?ver=prioridades | ?ver=registros
 const ver = new URLSearchParams(location.search).get('ver');
 if (ver === 'prioridades' || ver === 'registros') abrirLista(ver);

 window.TreePainel = { abrirLista, soMapa };
})();
