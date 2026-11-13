'use strict';
// Painel lateral (12/11/2026).
// Computador: arraste a borda esquerda para alargar/estreitar; botão › recolhe; botão "Painel" no mapa reabre.
// Celular: o mapa fica em tela cheia (só mapa + Filtros). O menu ☰ abre Prioridades ou Registros
//   em tela própria; tocar numa árvore abre a página da árvore em tela cheia (13/11: saiu a barra de arrastar).
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
 // modo: 'mapa' (painel escondido) | 'lista' (Prioridades/Registros em tela cheia) | 'ficha' (página da árvore, tela cheia)
 let modo = 'mapa', antesDaFicha = null;
 function aplicarCelular() {
  side.dataset.modo = modo;
  root.style.setProperty('--sheet-h', '0px');
  // botão de voltar: da árvore aberta pela lista volta para a lista
  const volta = $('sideVoltar').lastChild;
  if (volta && volta.nodeType === 3) volta.textContent = modo === 'ficha' && antesDaFicha === 'lista' ? 'Voltar' : 'Mapa';
  if (modo === 'ficha') $('sideTitulo').textContent = 'Árvore';
  refazerMapa();
 }
 function abrirLista(aba) {
  if (!celular.matches) { ui().aba?.(aba); if (estado.recolhido) { estado.recolhido = false; salvar(); aplicarComputador(); } return; }
  antesDaFicha = null;
  ui().fecharFicha?.();
  ui().aba?.(aba);
  modo = 'lista'; aplicarCelular();
  $('sideTitulo').textContent = TITULOS[aba] || '';
  window.TreeMenu?.marcar(aba);
  $('side').querySelector('.side-body').scrollTop = 0;
 }
 function soMapa() {
  antesDaFicha = null;
  ui().fecharFicha?.();
  modo = 'mapa'; aplicarCelular();
  window.TreeMenu?.marcar('mapa');
 }
 $('sideVoltar').addEventListener('click', () => { if (modo === 'ficha') ui().fecharFicha?.(); else soMapa(); });

 // árvore: abre em página própria (tela cheia); "Mapa"/"Voltar" fecha
 window.addEventListener('arvore-aberta', () => {
  if (celular.matches) { if (modo === 'lista') antesDaFicha = 'lista'; modo = 'ficha'; aplicarCelular(); $('side').querySelector('.side-body').scrollTop = 0; }
  else if (estado.recolhido) { estado.recolhido = false; salvar(); aplicarComputador(); }
 });
 window.addEventListener('arvore-fechada', () => {
  if (!celular.matches || modo !== 'ficha') return;
  const lista = antesDaFicha === 'lista';
  modo = lista ? 'lista' : 'mapa'; antesDaFicha = null; aplicarCelular();
  if (lista) $('sideTitulo').textContent = TITULOS[document.querySelector('[role=tab][aria-selected=true]')?.id?.slice(2)] || '';
 });

 function aplicar() {
  if (celular.matches) { main.classList.remove('recolhido'); $('expandBtn').hidden = true; aplicarCelular(); }
  else { root.style.removeProperty('--sheet-h'); aplicarComputador(); }
 }
 celular.addEventListener('change', aplicar);
 window.addEventListener('resize', () => { if (celular.matches) refazerMapa(); else aplicarComputador(); });
 aplicar();

 // chegou pelo menu de outra tela: ?ver=prioridades | ?ver=registros
 const ver = new URLSearchParams(location.search).get('ver');
 if (ver === 'prioridades' || ver === 'registros') abrirLista(ver);

 window.TreePainel = { abrirLista, soMapa };
})();
