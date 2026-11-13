'use strict';
// Painel lateral móvel (12/11/2026).
// Computador: arraste a borda esquerda para alargar/estreitar; botão › recolhe; botão "Painel" no mapa reabre.
// Celular: vira uma gaveta que sobe de baixo; arraste a alça para cima/baixo (encaixa em 3 alturas).
(function () {
 const $ = id => document.getElementById(id);
 const main = $('main'), side = $('side'), root = document.documentElement;
 const celular = matchMedia('(max-width: 768px)');
 const CHAVE = 'arvores-painel-v1';
 let estado = { largura: 380, recolhido: false, gaveta: 'meia' };
 try { Object.assign(estado, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch { /* padrão */ }
 const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem espaço */ } };
 const mapa = () => window.TreeMapaRef;
 let ajuste;
 const refazerMapa = () => { clearTimeout(ajuste); ajuste = setTimeout(() => mapa()?.invalidateSize({ pan: false }), 60); };

 // ---------- computador ----------
 const limitar = w => Math.round(Math.min(Math.max(w, 300), Math.min(760, window.innerWidth * 0.62)));
 function aplicarComputador() {
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

 // ---------- celular (gaveta) ----------
 const alturas = () => ({ fechada: 74, meia: Math.round(window.innerHeight * 0.46), cheia: Math.round(window.innerHeight * 0.86) });
 function aplicarCelular(px) {
  const a = alturas(), h = px ?? a[estado.gaveta] ?? a.meia;
  root.style.setProperty('--sheet-h', h + 'px');
  side.dataset.gaveta = px ? 'arrastando' : estado.gaveta;
  refazerMapa();
 }
 function irPara(nome) { estado.gaveta = nome; salvar(); aplicarCelular(); }
 $('sheetHandle').addEventListener('pointerdown', e => {
  if (!celular.matches) return;
  e.preventDefault(); $('sheetHandle').setPointerCapture(e.pointerId);
  const inicioY = e.clientY, inicioH = side.getBoundingClientRect().height, a = alturas();
  let h = inicioH, moveu = false;
  const mover = ev => { moveu = moveu || Math.abs(ev.clientY - inicioY) > 4; h = Math.min(Math.max(inicioH + (inicioY - ev.clientY), a.fechada), a.cheia); side.classList.add('sem-animacao'); aplicarCelular(h); };
  const soltar = () => {
   $('sheetHandle').removeEventListener('pointermove', mover); side.classList.remove('sem-animacao');
   if (!moveu) { irPara(estado.gaveta === 'fechada' ? 'meia' : estado.gaveta === 'meia' ? 'cheia' : 'fechada'); return; }
   const perto = Object.entries(alturas()).sort((x, y) => Math.abs(x[1] - h) - Math.abs(y[1] - h))[0][0];
   irPara(perto);
  };
  $('sheetHandle').addEventListener('pointermove', mover);
  $('sheetHandle').addEventListener('pointerup', soltar, { once: true });
  $('sheetHandle').addEventListener('pointercancel', soltar, { once: true });
 });
 // tocar numa aba com a gaveta fechada abre até a metade
 $('tabsBar').addEventListener('click', () => { if (celular.matches && estado.gaveta === 'fechada') irPara('meia'); });

 // ---------- botões ----------
 $('collapseBtn').addEventListener('click', () => {
  if (celular.matches) irPara('fechada');
  else { estado.recolhido = true; salvar(); aplicarComputador(); }
 });
 $('expandBtn').addEventListener('click', () => { estado.recolhido = false; salvar(); aplicarComputador(); });
 // ao abrir uma árvore, o painel aparece
 window.addEventListener('arvore-aberta', () => {
  if (celular.matches) { if (estado.gaveta === 'fechada') irPara('meia'); }
  else if (estado.recolhido) { estado.recolhido = false; salvar(); aplicarComputador(); }
 });

 function aplicar() {
  if (celular.matches) { main.classList.remove('recolhido'); $('expandBtn').hidden = true; aplicarCelular(); }
  else { root.style.removeProperty('--sheet-h'); aplicarComputador(); }
 }
 celular.addEventListener('change', aplicar);
 window.addEventListener('resize', () => { if (celular.matches) aplicarCelular(); else aplicarComputador(); });
 aplicar();
})();
