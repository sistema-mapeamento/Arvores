'use strict';
// Menu lateral do celular (12/11/2026): ícone ☰ no topo abre uma barra pela direita com as telas.
// Uso: <script src="menu.js" data-base="./" data-tela="mapa" defer></script>  (base = caminho até a raiz do site)
(function () {
 const eu = document.currentScript;
 const base = eu?.dataset.base || './', tela = eu?.dataset.tela || '';
 const exemplo = new URLSearchParams(location.search).has('exemplo');
 const comEx = (url, extra) => {
  const q = [extra, exemplo ? 'exemplo' : ''].filter(Boolean).join('&');
  return q ? url + (url.includes('?') ? '&' : '?') + q : url;
 };
 const IC = {
  mapa: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  prioridades: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  registros: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  dashboard: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  acoes: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
 avaliar: '<path d="M12 5v14M5 12h14"/>'
 };
 const itens = [
  ['mapa', 'Mapa', 'Ver as árvores no mapa', comEx(base)],
  ['acoes', 'Ações', 'Dar baixa: poda, poda drástica, supressão', comEx(base + 'acoes/')],
  ['prioridades', 'Prioridades', 'Árvores R4 e R3 primeiro', comEx(base, 'ver=prioridades')],
  ['registros', 'Registros', 'Todas as inspeções, com busca', comEx(base, 'ver=registros')],
  ['dashboard', 'Dashboard', 'Números e gráficos', comEx(base + 'dashboard/')],
  ['avaliar', 'Nova avaliação', 'Registrar uma árvore', base + 'avaliar/?nova=1']
 ];
 const svg = d => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

 const topo = document.querySelector('.bar, .abar');
 if (!topo) return;
 const botao = document.createElement('button');
 botao.type = 'button'; botao.className = 'menu-btn'; botao.setAttribute('aria-label', 'Abrir menu'); botao.setAttribute('aria-expanded', 'false');
 botao.innerHTML = svg('<path d="M4 6h16M4 12h16M4 18h16"/>');
 topo.append(botao);

 const fundo = document.createElement('div'); fundo.className = 'menu-fundo'; fundo.hidden = true;
 const gaveta = document.createElement('nav'); gaveta.className = 'menu-gaveta'; gaveta.setAttribute('aria-label', 'Menu'); gaveta.hidden = true;
 const cab = document.createElement('div'); cab.className = 'menu-cab';
 cab.innerHTML = '<b>Avaliação de Árvores</b><small>Usiminas · Ipatinga</small>';
 const fechar = document.createElement('button'); fechar.type = 'button'; fechar.className = 'menu-fechar'; fechar.setAttribute('aria-label', 'Fechar menu'); fechar.textContent = '×';
 cab.append(fechar);
 const lista = document.createElement('ul');
 for (const [id, nome, desc, href] of itens) {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = href; a.dataset.tela = id; if (id === tela) a.setAttribute('aria-current', 'page');
  if (id === 'avaliar') a.className = 'destaque';
  a.innerHTML = svg(IC[id]) + '<span><b></b><small></small></span>';
  a.querySelector('b').textContent = nome; a.querySelector('small').textContent = desc;
  a.addEventListener('click', e => {
   // na tela do mapa, Prioridades/Registros/Mapa abrem sem recarregar
   if (window.TreePainel && (id === 'prioridades' || id === 'registros' || id === 'mapa')) {
    e.preventDefault(); abrir(false);
    if (id === 'mapa') window.TreePainel.soMapa(); else window.TreePainel.abrirLista(id);
   }
  });
  li.append(a); lista.append(li);
 }
 gaveta.append(cab, lista);
 document.body.append(fundo, gaveta);

 function abrir(sim) {
  fundo.hidden = gaveta.hidden = !sim;
  botao.setAttribute('aria-expanded', String(sim));
  document.body.classList.toggle('menu-aberto', sim);
  if (sim) requestAnimationFrame(() => gaveta.classList.add('aberta')); else gaveta.classList.remove('aberta');
 }
 botao.addEventListener('click', () => abrir(gaveta.hidden));
 fechar.addEventListener('click', () => abrir(false));
 fundo.addEventListener('click', () => abrir(false));
 document.addEventListener('keydown', e => { if (e.key === 'Escape' && !gaveta.hidden) abrir(false); });
 window.TreeMenu = { marcar(id) { for (const a of lista.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.tela === id); } };
})();
